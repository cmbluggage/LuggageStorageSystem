'use client';

import React, { useState } from 'react';
import { Banknote, CheckCircle2 } from 'lucide-react';
import { bookingsApi, AdminApiError } from '@/lib/admin/api';
import { formatUSD } from '@/lib/currency';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';

/**
 * Shared by BookingsPanel (/admin) and staff/page.tsx (/staff) — cash-only,
 * hidden entirely for card bookings (those settle automatically at booking
 * time). Once collected it shows who collected it and when, so admins can
 * reconcile cash handed to staff without digging through the audit log.
 */
export function CashCollectButton({
  booking,
  onCollected,
}: {
  booking: BookingRecord;
  onCollected: (updated: BookingRecord) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (booking.paymentMethod !== 'cash') return null;

  if (booking.balanceDueUsd <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {booking.cashCollectedByName
          ? `Cash collected by ${booking.cashCollectedByName}${
              booking.cashCollectedAt ? ` · ${new Date(booking.cashCollectedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''
            }`
          : 'Cash collected'}
      </span>
    );
  }

  const collect = async () => {
    setBusy(true);
    try {
      const { booking: updated } = await bookingsApi.collectCash(booking.id);
      notify.success(`${formatUSD(booking.balanceDueUsd)} collected — ${booking.fullName || 'booking'} marked paid.`);
      onCollected(updated);
    } catch (e) {
      notify.error(e instanceof AdminApiError ? e.message : 'Could not record the cash collection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={collect}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                 bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Banknote className="w-3.5 h-3.5" /> {busy ? 'Marking…' : `Mark ${formatUSD(booking.balanceDueUsd)} collected`}
    </button>
  );
}
