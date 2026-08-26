'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { formatUSD } from '@/lib/currency';
import { bookingsApi, AdminApiError } from '@/lib/admin/api';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';
import { PanelHeader, ErrorBanner, EmptyState } from './primitives';
import { BookingEditForm } from './BookingEditForm';
import { QrScanButton } from '@/components/staff/QrScanButton';
import {
  Search, ChevronDown, ChevronRight, Phone, MessageCircle, Plane,
  CreditCard, Banknote, ChevronLeft, Pencil,
} from 'lucide-react';

/**
 * Booking browser.
 *
 * The old panel had no booking list at all — the "operations" tab showed
 * three hardcoded demo rows. This reads the real table with filters,
 * pagination and full detail, and is SuperAdmin-only because it exposes
 * customer contact details and identity documents.
 */

const PAGE_SIZE = 25;

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'deposited', label: 'In storage' },
  { value: 'picked_up', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_TONE: Record<BookingRecord['status'], string> = {
  confirmed: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-amber-100 text-amber-800',
  deposited: 'bg-orange-100 text-orange-800',
  picked_up: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

export function BookingsPanel() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await bookingsApi.list({
        status,
        paymentStatus,
        q: search.trim(),
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setBookings(data.bookings);
      setTotal(data.total);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'Could not load bookings.';
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  }, [status, paymentStatus, search, page]);

  const handleUpdateStatus = async (bookingId: string, nextStatus: string) => {
    setUpdatingId(bookingId);
    try {
      await bookingsApi.setStatus(bookingId, nextStatus);
      notify.success(`Booking status updated to "${nextStatus.replace('_', ' ')}".`);
      await load();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'Could not update status.';
      notify.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  /*
    Any filter change invalidates the current page offset, so the reset is
    folded into the setters rather than done in an effect that reacts to
    them — that version reset the page a render late, briefly requesting
    the old offset against the new filter.
  */
  const applyStatus = (v: string) => {
    setStatus(v);
    setPage(0);
  };
  const applyPaymentStatus = (v: string) => {
    setPaymentStatus(v);
    setPage(0);
  };
  const applySearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PanelHeader
        title="Bookings"
        description={`${total} booking(s) on record. Includes customer contact details — treat this screen as confidential.`}
      />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-5 flex flex-col gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => applySearch(e.target.value)}
              placeholder="Search name, phone, email, passport or reference…"
              aria-label="Search bookings"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold
                         text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600
                         focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
            />
          </div>
          <QrScanButton onScan={(id) => applySearch(id)} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => applyStatus(f.value)}
              aria-pressed={status === f.value}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer',
                status === f.value ? 'bg-[#1C130E] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}

          <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />

          <button
            onClick={() => applyPaymentStatus(paymentStatus === 'pending' ? '' : 'pending')}
            aria-pressed={paymentStatus === 'pending'}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer',
              paymentStatus === 'pending'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Unpaid only
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState title="No bookings match" hint="Try clearing the filters or search term." />
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {bookings.map((b) => (
              <article key={b.id} className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  aria-expanded={expanded === b.id}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className="text-slate-400 flex-shrink-0">
                    {expanded === b.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-900 truncate">{b.fullName || 'Guest'}</span>
                      {b.isAirportBooking && <Plane className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${STATUS_TONE[b.status]}`}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </span>
                    <span className="block text-xs font-medium text-slate-500 truncate mt-0.5">
                      {b.phone} · {new Date(b.createdAt).toLocaleDateString('en-GB')}
                    </span>
                  </span>

                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={[
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                        b.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                      ].join(' ')}
                    >
                      {b.paymentMethod === 'stripe' ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                      {b.paymentStatus}
                    </span>
                    <span className="text-sm font-extrabold text-slate-900 tabular-nums">
                      {formatUSD(b.grandTotalUsd)}
                    </span>
                  </span>
                </button>

                {expanded === b.id && (
                  <BookingDetail
                    booking={b}
                    onUpdateStatus={handleUpdateStatus}
                    updating={updatingId === b.id}
                    onSaved={load}
                  />
                )}
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3 mt-5" aria-label="Booking pages">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
                           bg-white border border-slate-200 text-slate-700 hover:bg-slate-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>

              <span className="text-xs font-bold text-slate-500 tabular-nums">
                Page {page + 1} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
                           bg-white border border-slate-200 text-slate-700 hover:bg-slate-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function BookingDetail({
  booking: b,
  onUpdateStatus,
  updating,
  onSaved,
}: {
  booking: BookingRecord;
  onUpdateStatus: (id: string, nextStatus: string) => Promise<void>;
  updating: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const tel = `tel:${b.phone.replace(/[^\d+]/g, '')}`;
  const wa = `https://wa.me/${b.phone.replace(/\D/g, '')}`;

  if (editing) {
    return (
      <div className="px-3.5 pb-4 pt-3 border-t border-slate-100">
        <BookingEditForm
          booking={b}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-3.5 pb-4 pt-1 border-t border-slate-100">
      <div className="flex items-center justify-between flex-wrap gap-2 my-3">
        <div className="flex items-center gap-2">
          <a
            href={tel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                       bg-slate-100 text-slate-700 hover:bg-orange-100 hover:text-orange-800 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" /> Call
          </a>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                       bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                       bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </div>

        {/* Quick Status Transitions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {['confirmed', 'in_transit', 'deposited', 'picked_up', 'cancelled'].map((st) => (
            <button
              key={st}
              disabled={updating || b.status === st}
              onClick={() => onUpdateStatus(b.id, st)}
              className={[
                'px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer',
                b.status === st
                  ? 'bg-slate-900 text-white cursor-default'
                  : 'bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-40',
              ].join(' ')}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs mb-4">
        <Row label="Reference" value={b.id} mono />
        <Row label="Email" value={b.email || '—'} />
        <Row label="Passport / NIC" value={b.passportNo || '—'} mono />
        <Row label="Duration" value={`${b.durationDays} day(s)`} />
        <Row label="Drop-off" value={`${b.dropoffLocationName} · ${fmt(b.dropoffTime)}`} />
        <Row label="Pick-up" value={`${b.pickupLocationName} · ${fmt(b.pickupTime)}`} />
      </dl>

      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Charges</p>
        <ul className="flex flex-col gap-1.5 text-xs">
          {b.items.map((item, i) => (
            <li key={`${item.tierId}-${i}`} className="flex justify-between gap-3">
              <span className="font-semibold text-slate-700">
                {item.qty}× {item.tierName ?? item.tierId}
                <span className="text-slate-400 font-medium"> @ {formatUSD(item.unitRateUsd)}/day</span>
              </span>
              <span className="font-bold text-slate-900 tabular-nums">{formatUSD(item.lineTotalUsd)}</span>
            </li>
          ))}
          <Charge label="Storage subtotal" value={b.itemTotalUsd} />
          {b.dropoffSurchargeUsd > 0 && <Charge label="Drop-off surcharge" value={b.dropoffSurchargeUsd} />}
          {b.pickupSurchargeUsd > 0 && <Charge label="Pick-up surcharge" value={b.pickupSurchargeUsd} />}
          {b.airportServiceUsd > 0 && <Charge label="Airport handling" value={b.airportServiceUsd} />}
          {b.insuranceTotalUsd > 0 && <Charge label="Insurance" value={b.insuranceTotalUsd} />}
          <li className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-200">
            <span className="font-extrabold text-slate-900">Total</span>
            <span className="font-extrabold text-slate-900 tabular-nums">{formatUSD(b.grandTotalUsd)}</span>
          </li>
        </ul>
      </div>

      {b.notes && (
        <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Customer note</p>
          <p className="text-xs font-medium text-amber-950">{b.notes}</p>
        </div>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className={['font-semibold text-slate-900 break-words', mono ? 'font-mono text-[11px]' : ''].join(' ')}>
        {value}
      </dd>
    </div>
  );
}

function Charge({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-3 text-slate-500">
      <span className="font-semibold">{label}</span>
      <span className="font-bold tabular-nums">{formatUSD(value)}</span>
    </li>
  );
}
