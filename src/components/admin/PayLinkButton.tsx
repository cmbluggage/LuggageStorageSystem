'use client';

import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import { CreditCard, X } from 'lucide-react';
import { bookingsApi, AdminApiError } from '@/lib/admin/api';
import { formatUSD } from '@/lib/currency';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';

/**
 * Staff pay-at-counter action for a card balance: generates a real Stripe
 * Checkout Session for `balanceDueUsd` and shows it as a QR the customer
 * scans with their own phone. Nothing on this screen marks the booking
 * paid — the Stripe webhook does that once the charge actually settles, so
 * staff see the balance clear on its own once the customer completes it.
 */
export function PayLinkButton({ booking }: { booking: BookingRecord }) {
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

      {open && <PayLinkModal url={url} amountUsd={booking.balanceDueUsd} onClose={() => setOpen(false)} />}
    </>
  );
}

function PayLinkModal({ url, amountUsd, onClose }: { url: string; amountUsd: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 2, color: { dark: '#1C130E', light: '#ffffff' } });
    }
  }, [url]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-label="Card payment QR">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-extrabold text-slate-900">Scan to pay {formatUSD(amountUsd)}</span>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <canvas ref={canvasRef} className="mx-auto rounded-xl" />
        <p className="text-[11px] font-medium text-slate-500 mt-3">
          Customer scans with their phone to pay securely via Stripe. This updates automatically once paid.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-[11px] font-bold text-orange-700 underline break-all"
        >
          Or open the link directly
        </a>
      </div>
    </div>
  );
}
