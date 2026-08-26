'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Button } from '@/components/ui/Button';
import { formatUSD } from '@/lib/currency';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';
import {
  Phone, MessageSquare, QrCode, MapPin, Box, Clock, Search,
  AlertCircle, Plane, CreditCard, Banknote,
} from 'lucide-react';

/**
 * Customer booking history, looked up by phone number.
 *
 * There is no customer login by design — the operator follows up over
 * WhatsApp, so knowing the phone number is the only credential. The lookup
 * endpoint is rate-limited per IP and omits the passport number for that
 * reason.
 *
 * The previous version seeded state with a hardcoded sample booking, so a
 * customer with no bookings (or a failed request) was shown someone else's
 * itinerary and a "Total Paid" figure.
 */

/** Booking as returned by GET /api/bookings — passport is stripped server-side. */
type CustomerBooking = Omit<BookingRecord, 'passportNo'>;

const STATUS_TONE: Record<BookingRecord['status'], string> = {
  confirmed: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-amber-100 text-amber-800',
  deposited: 'bg-orange-100 text-orange-800',
  picked_up: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

const STATUS_LABEL: Record<BookingRecord['status'], string> = {
  confirmed: 'Confirmed',
  in_transit: 'On the way',
  deposited: 'In storage',
  picked_up: 'Collected',
  cancelled: 'Cancelled',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyBookingsPage() {
  const [phoneInput, setPhoneInput] = useState('');
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [support, setSupport] = useState({
    phone: DEFAULT_SETTINGS.support_phone,
    whatsapp: DEFAULT_SETTINGS.support_whatsapp,
  });

  // Support numbers are operator-configurable rather than constants here.
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings) {
          setSupport({
            phone: data.settings.support_phone ?? DEFAULT_SETTINGS.support_phone,
            whatsapp: data.settings.support_whatsapp ?? DEFAULT_SETTINGS.support_whatsapp,
          });
        }
      })
      .catch(() => {});
  }, []);

  const lookup = useCallback(async (phone: string, showToastFeedback = false) => {
    const trimmed = phone.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings?phone=${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error ?? 'We could not look up those bookings. Please try again.';
        setError(msg);
        notify.error(msg);
        setBookings([]);
        return;
      }

      const list: CustomerBooking[] = data.bookings ?? [];
      setBookings(list);
      setActivePhone(trimmed);
      if (typeof window !== 'undefined') localStorage.setItem('stowaway_customer_phone', trimmed);

      if (showToastFeedback) {
        if (list.length > 0) {
          notify.success(`Found ${list.length} booking${list.length === 1 ? '' : 's'}.`);
        } else {
          notify.info('No bookings found for that phone number.');
        }
      }
    } catch {
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setError(msg);
      notify.error(msg);
      setBookings([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  // Deferred so the state updates land outside the effect body.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || typeof window === 'undefined') return;
      const saved = localStorage.getItem('stowaway_customer_phone');
      if (saved) {
        setPhoneInput(saved);
        void lookup(saved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lookup]);

  const waHref = `https://wa.me/${support.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
    'Hello Luggage Storage Colombo support, I have a question about my booking.',
  )}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full" id="my-bookings-main">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 mb-8 pb-6 border-b border-slate-200">
          <div className="min-w-0">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 mb-2 inline-block">
              Your Bookings
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-[#1C130E] tracking-tight">
              Find your storage
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-1.5 max-w-md">
              Enter the phone number you booked with. Our team follows up on WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto flex-shrink-0">
            <a href={`tel:${support.phone.replace(/[^\d+]/g, '')}`} className="flex-1 md:flex-none">
              <Button variant="secondary" size="md" className="w-full">
                <Phone className="w-4 h-4 text-orange-600" /> Call
              </Button>
            </a>
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex-1 md:flex-none">
              <Button variant="primary" size="md" className="w-full">
                <MessageSquare className="w-4 h-4" /> WhatsApp
              </Button>
            </a>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(phoneInput, true);
          }}
          className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 mb-8"
        >
          <label htmlFor="phone-lookup" className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            Phone number
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="phone-lookup"
                type="tel"
                inputMode="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+94 77 123 4567"
                autoComplete="tel"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold
                           text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600
                           focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
              />
            </div>
            <Button type="submit" variant="dark" size="md" loading={loading} disabled={!phoneInput.trim()}>
              <Search className="w-4 h-4" /> Find bookings
            </Button>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-2">
            Include your country code, exactly as entered when booking.
          </p>
        </form>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5
                       text-sm font-semibold text-red-800"
          >
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-44 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : !searched ? null : bookings.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 sm:p-12 text-center border border-slate-200 max-w-md mx-auto shadow-2xs">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">No bookings found</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">
              We could not find any bookings for {activePhone || 'that number'}. Check the country code, or
              message us on WhatsApp and we&apos;ll look it up for you.
            </p>
            <Link href="/book">
              <Button variant="primary" size="lg" className="w-full">
                Book storage
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {bookings.map((b) => (
              <article
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs
                           flex flex-col lg:flex-row justify-between gap-6 items-start"
              >
                <div className="flex-1 flex flex-col gap-4 min-w-0 w-full">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${STATUS_TONE[b.status]}`}
                    >
                      {STATUS_LABEL[b.status]}
                    </span>
                    {b.isAirportBooking && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1C130E] text-orange-400">
                        <Plane className="w-3 h-3" /> Airport
                      </span>
                    )}
                    <span
                      className={[
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                        b.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                      ].join(' ')}
                    >
                      {b.paymentMethod === 'stripe' ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                      {b.paymentStatus === 'paid' ? 'Paid' : 'Pay at drop-off'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 font-bold ml-auto">#{b.id.slice(0, 8)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Box className="w-4 h-4 text-orange-600 mt-1 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Drop-off</p>
                        <p className="text-sm font-bold text-slate-900 break-words">{b.dropoffLocationName}</p>
                        <p className="text-xs text-slate-500 font-medium">{formatWhen(b.dropoffTime)}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 min-w-0">
                      <MapPin className="w-4 h-4 text-orange-600 mt-1 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pick-up</p>
                        <p className="text-sm font-bold text-slate-900 break-words">{b.pickupLocationName}</p>
                        <p className="text-xs text-slate-500 font-medium">{formatWhen(b.pickupTime)}</p>
                      </div>
                    </div>
                  </div>

                  <ul className="flex flex-col gap-1">
                    {b.items.map((item, i) => (
                      <li key={`${item.tierId}-${i}`} className="flex items-center gap-2 text-sm">
                        <span aria-hidden="true">{item.iconEmoji ?? '🧳'}</span>
                        <span className="font-bold text-slate-900">
                          {item.qty}× {item.tierName ?? 'Stored item'}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {b.notes && (
                    <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                      <strong className="text-amber-900">Your note:</strong> {b.notes}
                    </p>
                  )}
                </div>

                <div className="w-full lg:w-52 bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col items-center justify-between text-center gap-4 flex-shrink-0">
                  <QrCode className="w-14 h-14 text-slate-900" aria-hidden="true" />
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                      {b.paymentStatus === 'paid' ? 'Total paid' : 'Due at drop-off'}
                    </span>
                    <span className="text-2xl font-black text-orange-600">{formatUSD(b.grandTotalUsd)}</span>
                  </div>
                  <Link href={`/booking/${b.id}/confirmation`} className="w-full">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      View QR pass
                    </Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
