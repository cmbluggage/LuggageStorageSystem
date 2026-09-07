'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Button } from '@/components/ui/Button';
import { formatUSD } from '@/lib/currency';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';
import {
  Phone, MessageSquare, QrCode, MapPin, Box, Clock, Search,
  AlertCircle, Plane, CreditCard, Banknote, Mail, ShieldCheck, ArrowLeft,
} from 'lucide-react';

/**
 * Customer booking history, gated by an emailed 6-digit code.
 *
 * Previously this looked bookings up by phone number alone — a real
 * security gap, since a phone number is knowable by someone other than
 * the customer (unlike, say, a booking's unguessable UUID). Now: the
 * customer enters their phone OR email, we resolve it server-side to
 * whatever email is on file for that account (never the raw typed value —
 * see /api/otp/request), send a code there, and only return bookings once
 * that code is verified. See src/lib/otp.ts for the full design.
 */

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

type Stage = 'contact' | 'code' | 'results';

export default function MyBookingsPage() {
  const [stage, setStage] = useState<Stage>('contact');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);

  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [support, setSupport] = useState({
    phone: DEFAULT_SETTINGS.support_phone,
    whatsapp: DEFAULT_SETTINGS.support_whatsapp,
  });

  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => () => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1 && cooldownTimer.current) clearInterval(cooldownTimer.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const requestCode = async () => {
    if (!contact.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: contact.trim(), purpose: 'booking_lookup' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ?? 'We could not send a code. Please try again.';
        setError(msg);
        notify.error(msg);
        return;
      }
      setRequestId(data.requestId);
      setStage('code');
      startCooldown(60);
      notify.success('If that matches an account, we\'ve emailed a 6-digit code.');
    } catch {
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyAndFetch = async () => {
    if (!requestId || code.trim().length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, code: code.trim(), purpose: 'booking_lookup' }),
      });
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !verifyData?.verified) {
        const msg = verifyData?.message ?? 'Incorrect or expired code.';
        setError(msg);
        notify.error(msg);
        return;
      }

      const listRes = await fetch(`/api/my-bookings?verificationId=${encodeURIComponent(requestId)}`);
      const listData = await listRes.json().catch(() => null);
      if (!listRes.ok) {
        const msg = listData?.error ?? 'We could not load your bookings. Please try again.';
        setError(msg);
        notify.error(msg);
        return;
      }

      const list: CustomerBooking[] = listData.bookings ?? [];
      setBookings(list);
      setStage('results');
      if (list.length === 0) notify.info('No bookings found for that account.');
      else notify.success(`Found ${list.length} booking${list.length === 1 ? '' : 's'}.`);
    } catch {
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setStage('contact');
    setCode('');
    setRequestId(null);
    setBookings([]);
    setError('');
  };

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
              We&apos;ll email a verification code to keep your booking details private.
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

        {stage === 'contact' && (
          <form
            onSubmit={(e) => { e.preventDefault(); void requestCode(); }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 mb-8 max-w-lg"
          >
            <label htmlFor="contact-lookup" className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
              Phone number or email
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="contact-lookup"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="+94 77 123 4567 or you@example.com"
                  autoComplete="tel"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold
                             text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600
                             focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
                />
              </div>
              <Button type="submit" variant="dark" size="md" loading={loading} disabled={!contact.trim()}>
                <Search className="w-4 h-4" /> Send code
              </Button>
            </div>
            <p className="text-[11px] font-medium text-slate-400 mt-2">
              We&apos;ll email a 6-digit code to the address on file for this account — not to whatever you type here.
            </p>
          </form>
        )}

        {stage === 'code' && (
          <form
            onSubmit={(e) => { e.preventDefault(); void verifyAndFetch(); }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 mb-8 max-w-lg"
          >
            <button
              type="button"
              onClick={startOver}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 mb-4"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Use a different phone/email
            </button>
            <div className="flex items-center gap-2 mb-1.5">
              <Mail className="w-4 h-4 text-orange-600" />
              <label htmlFor="otp-code" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Enter the 6-digit code we emailed you
              </label>
            </div>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3.5 text-2xl font-black tracking-[0.5em] text-center
                         text-slate-900 placeholder-slate-300 focus:outline-none focus:border-orange-600
                         focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
            />
            <div className="flex items-center justify-between mt-4 gap-3">
              <button
                type="button"
                onClick={requestCode}
                disabled={cooldown > 0 || loading}
                className="text-xs font-bold text-orange-700 hover:text-orange-800 disabled:text-slate-300 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
              <Button type="submit" variant="primary" size="md" loading={loading} disabled={code.length !== 6}>
                <ShieldCheck className="w-4 h-4" /> Verify &amp; view bookings
              </Button>
            </div>
            <p className="text-sm font-medium text-slate-500 mt-3 text-center">
              Don&apos;t see it? Check your spam or junk folder.
            </p>
          </form>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5
                       text-sm font-semibold text-red-800 max-w-lg"
          >
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {stage === 'results' && (
          <>
            <button
              type="button"
              onClick={startOver}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 mb-5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Look up a different account
            </button>

            {bookings.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 sm:p-12 text-center border border-slate-200 max-w-md mx-auto shadow-2xs">
                <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-900 mb-2">No bookings found</h2>
                <p className="text-sm text-slate-500 mb-6 font-medium">
                  We could not find any bookings on this account. Message us on WhatsApp and we&apos;ll look it up for you.
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
          </>
        )}
      </main>
    </div>
  );
}
