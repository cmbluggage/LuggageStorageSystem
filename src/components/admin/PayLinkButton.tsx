'use client';

import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import { CreditCard, X, CheckCircle2 } from 'lucide-react';
import { bookingsApi, AdminApiError } from '@/lib/admin/api';
import { formatUSD } from '@/lib/currency';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';

/**
 * Staff pay-at-counter action for a card balance: generates a real Stripe
 * Checkout Session for `balanceDueUsd` and shows it as a QR the customer
 * scans with their own phone. The charge settles on Stripe's servers and
 * the webhook updates the ledger asynchronously — staff are standing there
 * watching, so the modal polls the booking every few seconds while open
 * and flips to a "Paid" state the moment the webhook lands, instead of
 * silently updating a record nobody's looking at.
 */
export function PayLinkButton({ booking, onPaid }: { booking: BookingRecord; onPaid?: (updated: BookingRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');

  if (booking.paymentMethod !== 'stripe' || booking.balanceDueUsd <= 0) return null;

  const start = async () => {
    setBusy(true);
    try {
      const { url: payUrl } = await bookingsApi.createPayLink(booking.id);
      setUrl(payUrl);
      setOpen(true);
    } catch (e) {
      notify.error(e instanceof AdminApiError ? e.message : 'Could not start that payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                   bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors cursor-pointer
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CreditCard className="w-3.5 h-3.5" /> {busy ? 'Starting…' : `Get pay link — ${formatUSD(booking.balanceDueUsd)}`}
      </button>

      {open && (
        <PayLinkModal
          bookingId={booking.id}
          url={url}
          amountUsd={booking.balanceDueUsd}
          onClose={() => setOpen(false)}
          onPaid={(updated) => {
            setOpen(false);
            onPaid?.(updated);
          }}
        />
      )}
    </>
  );
}

/** How often to check whether the webhook has landed while a staff member is watching. */
const POLL_MS = 3000;

function PayLinkModal({
  bookingId,
  url,
  amountUsd,
  onClose,
  onPaid,
}: {
  bookingId: string;
  url: string;
  amountUsd: number;
  onClose: () => void;
  onPaid: (updated: BookingRecord) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 2, color: { dark: '#1C130E', light: '#ffffff' } });
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const { booking } = await bookingsApi.get(bookingId);
        if (cancelled) return;
        if (booking.balanceDueUsd <= 0) {
          setPaid(true);
          notify.success('Payment received.');
          // Give the "Paid" state a beat on screen before handing back to the caller's refresh.
          setTimeout(() => !cancelled && onPaid(booking), 1200);
          return;
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPaid intentionally excluded, re-subscribing would restart the poll interval
  }, [bookingId]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-label="Card payment QR">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-extrabold text-slate-900">
            {paid ? 'Payment received' : `Scan to pay ${formatUSD(amountUsd)}`}
          </span>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {paid ? (
          <div className="py-6 flex flex-col items-center gap-2">
            <CheckCircle2 className="w-16 h-16 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-700">{formatUSD(amountUsd)} paid</p>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="mx-auto rounded-xl" />
            <p className="text-[11px] font-medium text-slate-500 mt-3 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" aria-hidden="true" />
              Watching for payment — this updates on its own once the customer pays.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-[11px] font-bold text-orange-700 underline break-all"
            >
              Or open the link directly
            </a>
          </>
        )}
      </div>
    </div>
  );
}
