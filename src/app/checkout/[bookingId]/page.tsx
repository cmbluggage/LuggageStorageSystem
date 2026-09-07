'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Button } from '@/components/ui/Button';
import { formatUSD, formatLKR } from '@/lib/currency';
import { calculateDuration, type PricingBreakdown } from '@/lib/pricing';
import { notify } from '@/lib/toast';
import {
  CreditCard,
  Banknote,
  Box,
  Calendar,
  MapPin,
  ShieldCheck,
  AlertCircle,
  User,
  Phone,
  Mail,
  FileText,
} from 'lucide-react';
import type { BookingRecord } from '@/lib/db';
import { bookingTouchesAirport, type LocationFlags } from '@/lib/locations';

interface CheckoutSessionData {
  bookingId?: string;
  phone?: string;
  fullName?: string;
  email?: string;
  passportNo?: string;
  flightNumber?: string;
  dropoffLocation?: CheckoutLocation | null;
  pickupLocation?: CheckoutLocation | null;
  dropoffId?: string | null;
  pickupId?: string | null;
  dropoffTime?: string;
  pickupTime?: string;
  quantities?: Record<string, number>;
  selectedTiers?: {
    tierId: string;
    name: string;
    qty: number;
    rateDaily: number;
    rateWeekly: number;
    insuranceFee: number;
  }[];
  insuranceEnabled?: boolean;
  breakdown?: PricingBreakdown;
  grandTotalUsd?: number;
  isAirportBooking?: boolean;
  allowsCash?: boolean;
  createdAt?: string;
}

function formatDateTimeDisplay(iso?: string | null): string {
  if (!iso) return 'Not specified';
  try {
    const [dStr, tStr] = iso.split('T');
    if (!dStr) return iso;
    const dateObj = new Date(`${dStr}T00:00:00`);
    const datePart = dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    let timePart = tStr ? tStr.slice(0, 5) : '';
    if (timePart) {
      const [h, m] = timePart.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      const minFormatted = m < 10 ? `0${m}` : `${m}`;
      timePart = `${hour12}:${minFormatted} ${ampm}`;
    }
    return `${datePart}${timePart ? ` at ${timePart}` : ''}`;
  } catch {
    return iso;
  }
}

/** A catalog location row as this page needs it. */
interface CheckoutLocation extends LocationFlags {
  dropoff_surcharge_usd?: number;
  pickup_surcharge_usd?: number;
}

/** A catalog item-tier row as this page needs it. */
interface CheckoutTier {
  id: string;
  name?: string;
  rate_daily_usd?: number;
  rate_weekly_usd?: number;
  insurance_fee_usd?: number;
}

/**
 * Resolve a location reference (row, id, code or name) to the catalog row,
 * so the airport rule is always evaluated against real flags rather than
 * against whatever string happened to be in session storage.
 */
function resolveLocation(ref: unknown, all: CheckoutLocation[]): CheckoutLocation | null {
  if (!ref) return null;
  if (typeof ref === 'object') return ref as CheckoutLocation;
  if (typeof ref !== 'string') return null;
  return (
    all.find(
      (l) => l.id === ref || l.code === ref || l.code?.toLowerCase() === ref.toLowerCase() || l.name === ref,
    ) ?? null
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.bookingId as string;

  // 1. Initial State Handoff from SessionStorage
  const [sessionData] = useState<CheckoutSessionData | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('stowaway_checkout_session');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('Error reading session data:', e);
      }
    }
    return null;
  });

  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [locations, setLocations] = useState<CheckoutLocation[]>([]);
  const [itemTiers, setItemTiers] = useState<CheckoutTier[]>([]);

  // Payment form state. `paymentMethod` below is the *effective* method:
  // when cash is not offered this preference is ignored entirely.
  const [paymentPreference, setPaymentPreference] = useState<'stripe' | 'cash'>('stripe');
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Background hydration
  useEffect(() => {
    fetch('/api/locations')
      .then(r => r.json())
      .then(d => setLocations(d.locations || []))
      .catch(console.error);

    fetch('/api/item-tiers')
      .then(r => r.json())
      .then(d => setItemTiers(d.itemTiers || []))
      .catch(console.error);

    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setStripeEnabled(Boolean(d.stripeEnabled)))
      .catch(() => setStripeEnabled(false));

    if (bookingId && !bookingId.startsWith('bk-')) {
      fetch(`/api/bookings/${bookingId}`)
        .then(res => res.json())
        .then(data => {
          if (data.booking) setBooking(data.booking);
        })
        .catch(console.error);
    }
  }, [bookingId]);

  // Derive Locations
  const dropoffLoc = useMemo(
    () =>
      resolveLocation(sessionData?.dropoffLocation, locations) ??
      resolveLocation(sessionData?.dropoffId ?? booking?.dropoffLocationId, locations),
    [sessionData, booking, locations],
  );

  const pickupLoc = useMemo(
    () =>
      resolveLocation(sessionData?.pickupLocation, locations) ??
      resolveLocation(sessionData?.pickupId ?? booking?.pickupLocationId, locations),
    [sessionData, booking, locations],
  );

  /**
   * Airport lockout.
   *
   * Once the booking has loaded, the server's own verdict wins — it read
   * the location rows directly and is the value the payment endpoint will
   * enforce. Before that, fall back to the resolved catalog rows.
   *
   * This is a display concern only: /api/bookings/[id] re-derives the rule
   * server-side, so a tampered client cannot pay cash for an airport booking.
   */
  const isAirportBooking = useMemo(() => {
    if (booking) return booking.isAirportBooking;
    return bookingTouchesAirport(dropoffLoc, pickupLoc) || Boolean(sessionData?.isAirportBooking);
  }, [booking, dropoffLoc, pickupLoc, sessionData]);

  const allowsCash = !isAirportBooking;

  /*
    Derived rather than synced through an effect. Forcing the preference
    back to 'stripe' inside a useEffect meant there was a render in which
    an airport booking still showed 'cash' selected.
  */
  const paymentMethod: 'stripe' | 'cash' = allowsCash ? paymentPreference : 'stripe';
  const setPaymentMethod = setPaymentPreference;

  // Storage Times
  const dropoffTime = sessionData?.dropoffTime || booking?.dropoffTime || '';
  const pickupTime = sessionData?.pickupTime || booking?.pickupTime || '';

  // Duration
  const duration = useMemo(() => {
    if (sessionData?.breakdown?.duration) return sessionData.breakdown.duration;
    if (dropoffTime && pickupTime) return calculateDuration(dropoffTime, pickupTime);
    return { billableUnit: 'days', count: 1, label: '1 day' };
  }, [sessionData, dropoffTime, pickupTime]);

  // Stored Items
  const itemsList = useMemo(() => {
    if (sessionData?.selectedTiers && sessionData.selectedTiers.length > 0) {
      return sessionData.selectedTiers;
    }
    if (sessionData?.quantities && itemTiers.length > 0) {
      return Object.entries(sessionData.quantities)
        .filter(([, q]) => q > 0)
        .map(([tierId, qty]) => {
          const tier = itemTiers.find(t => t.id === tierId);
          return {
            tierId,
            qty,
            name: tier?.name || 'Stored Item',
            rateDaily: tier?.rate_daily_usd ?? 3.0,
            rateWeekly: tier?.rate_weekly_usd ?? 2.4,
            insuranceFee: tier?.insurance_fee_usd ?? 2.4,
          };
        });
    }
    if (booking?.items && booking.items.length > 0 && itemTiers.length > 0) {
      return booking.items.map((it) => {
        const tier = itemTiers.find(t => t.id === it.tierId);
        return {
          tierId: it.tierId,
          qty: it.qty,
          name: tier?.name || 'Stored Item',
          rateDaily: tier?.rate_daily_usd ?? 3.0,
          rateWeekly: tier?.rate_weekly_usd ?? 2.4,
          insuranceFee: tier?.insurance_fee_usd ?? 2.4,
        };
      });
    }
    return [];
  }, [sessionData, booking, itemTiers]);

  // Breakdown Calculations
  const breakdown = useMemo(() => {
    if (sessionData?.breakdown) return sessionData.breakdown;

    const days = Math.max(1, duration.count || 1);
    const dropoffSurcharge = dropoffLoc?.dropoff_surcharge_usd ?? 0;
    const pickupSurcharge = pickupLoc?.pickup_surcharge_usd ?? 0;
    const insuranceEnabled = sessionData?.insuranceEnabled ?? booking?.insuranceEnabled ?? false;

    let itemFee = 0;
    let insuranceFee = 0;

    itemsList.forEach(it => {
      const rate = days > 7 ? it.rateWeekly : it.rateDaily;
      itemFee += rate * it.qty * days;
      if (insuranceEnabled) {
        insuranceFee += it.insuranceFee * it.qty;
      }
    });

    const grandTotal = itemFee + dropoffSurcharge + pickupSurcharge + insuranceFee;

    return {
      duration,
      itemFee,
      dropoffSurcharge,
      pickupSurcharge,
      insuranceFee,
      grandTotal,
    };
  }, [sessionData, booking, duration, dropoffLoc, pickupLoc, itemsList]);

  const grandTotal = sessionData?.grandTotalUsd || booking?.grandTotalUsd || breakdown.grandTotal || 0;

  // Customer Contact Info
  const customerName = sessionData?.fullName || booking?.fullName || 'Valued Guest';
  const customerPhone = sessionData?.phone || booking?.phone || '+94 77 123 4567';
  const customerEmail = sessionData?.email || booking?.email || '';
  const customerPassport = sessionData?.passportNo || booking?.passportNo || '';

  const handleConfirm = async () => {
    setError('');
    setLoading(true);
    const effectiveBookingId = sessionData?.bookingId || bookingId;

    // Real Stripe: hand off to the hosted Checkout page. Nothing is marked
    // paid here — the webhook does that once Stripe confirms the charge.
    if (paymentMethod === 'stripe' && stripeEnabled) {
      try {
        const res = await fetch(`/api/bookings/${effectiveBookingId}/checkout`, { method: 'POST' });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          const msg = data?.error ?? 'We could not start your payment. Please try again.';
          setError(msg);
          notify.error(msg);
          setLoading(false);
          return;
        }
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('stowaway_checkout_session');
          sessionStorage.removeItem('stowaway_booking_state');
          window.location.href = data.url;
        }
        return;
      } catch {
        const msg = 'We could not reach our servers. Check your connection and try again.';
        setError(msg);
        notify.error(msg);
        setLoading(false);
        return;
      }
    }

    /*
      Cash, or card with no live Stripe key configured yet (dev/demo
      fallback — settles instantly via the ledger, same as before Stripe
      was wired in). Record the payment before showing a confirmation: the
      previous version swallowed every failure and navigated to the
      confirmation page regardless, so a customer could be shown a QR pass
      for a booking the server had never marked as paid.
    */
    try {
      const res = await fetch(`/api/bookings/${effectiveBookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          paymentStatus: paymentMethod === 'stripe' ? 'paid' : 'pending',
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // 409 means it was already settled — treat as success and continue.
        if (res.status !== 409) {
          const msg = data?.error ?? 'We could not confirm your payment. Please try again.';
          setError(msg);
          notify.error(msg);
          setLoading(false);
          return;
        }
      }
    } catch {
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setError(msg);
      notify.error(msg);
      setLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('stowaway_checkout_session');
      sessionStorage.removeItem('stowaway_booking_state');
    }

    notify.success(
      paymentMethod === 'stripe'
        ? 'Payment processed successfully!'
        : 'Booking confirmed! Please pay cash upon drop-off.',
    );
    setLoading(false);
    router.push(`/booking/${effectiveBookingId}/confirmation?pm=${paymentMethod}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <SiteHeader />

      <main className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6" id="checkout-main">
        {/* Header */}
        <div className="mb-8">
          <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 mb-3 inline-block uppercase tracking-wider">
            Final Step
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1C130E] tracking-tight">Complete your booking</h1>
          <p className="text-base text-slate-600 mt-2 font-medium">
            Review your full reservation summary and select your payment method.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* Left: Payment Method Form */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/*
              Payment method.

              When an airport leg is involved the booking is card-only, so
              the cash option is not rendered at all — the previous build
              showed a large amber warning explaining airport security
              protocols, which drew attention to an option the customer
              could not choose. A single quiet line of context is enough.
            */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-baseline justify-between gap-3 mb-6 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900">
                  {allowsCash ? 'Select Payment Method' : 'Payment'}
                </h2>
                {!allowsCash && (
                  <span className="text-xs font-medium text-slate-500">Card payment for airport bookings</span>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <label
                  className={[
                    'flex items-center gap-4 p-5 rounded-2xl border-2 transition-all',
                    allowsCash ? 'cursor-pointer' : 'cursor-default',
                    paymentMethod === 'stripe'
                      ? 'border-orange-600 bg-orange-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                  id="payment-stripe-label"
                >
                  {/* With cash hidden there is nothing to choose between, so
                      the radio is dropped rather than shown pre-selected. */}
                  {allowsCash && (
                    <input
                      type="radio"
                      name="payment"
                      value="stripe"
                      checked={paymentMethod === 'stripe'}
                      onChange={() => setPaymentMethod('stripe')}
                      className="accent-orange-600 w-4 h-4 cursor-pointer"
                      id="payment-stripe"
                    />
                  )}
                  <CreditCard className="w-6 h-6 text-orange-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900">Credit / Debit Card</p>
                    <p className="text-xs font-medium text-slate-500">
                      Instant confirmation, encrypted in transit
                    </p>
                  </div>
                  {allowsCash && (
                    <span className="ml-auto text-xs font-bold px-2.5 py-1 bg-orange-100 text-orange-800 rounded-full">
                      Recommended
                    </span>
                  )}
                </label>

                {allowsCash && (
                  <label
                    className={[
                      'flex items-center gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all',
                      paymentMethod === 'cash'
                        ? 'border-orange-600 bg-orange-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300',
                    ].join(' ')}
                    id="payment-cash-label"
                  >
                    <input
                      type="radio"
                      name="payment"
                      value="cash"
                      checked={paymentMethod === 'cash'}
                      onChange={() => setPaymentMethod('cash')}
                      className="accent-orange-600 w-4 h-4 cursor-pointer"
                      id="payment-cash"
                    />
                    <Banknote className="w-6 h-6 text-slate-700 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-900">Cash on Drop-off</p>
                      <p className="text-xs font-medium text-slate-500">
                        Pay at the counter when you hand over your items
                      </p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Card payment — real Stripe redirect, or the dev fallback when no live key is configured */}
            {paymentMethod === 'stripe' && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-2xs animate-fade-in">
                {stripeEnabled ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0" />
                    <p className="text-xs font-semibold text-slate-700">
                      You&rsquo;ll be redirected to Stripe&rsquo;s secure checkout to complete payment.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-xs font-semibold text-amber-900">
                      <strong>Demo mode</strong> — card payments aren&rsquo;t live yet. Confirming will mark this booking paid without a real charge.
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs font-bold text-red-700">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={handleConfirm}
              loading={loading}
              id="confirm-pay-btn"
              className="py-4 text-base font-black shadow-sm cursor-pointer"
            >
              {loading
                ? 'Processing...'
                : paymentMethod === 'cash'
                ? `Confirm Reservation — Pay ${formatUSD(grandTotal)} Cash at Drop-off`
                : stripeEnabled
                ? `Continue to secure payment — ${formatUSD(grandTotal)}`
                : `Confirm & Pay — ${formatUSD(grandTotal)}`}
            </Button>

            <p className="text-xs text-center text-slate-500 font-medium flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              <span>Protected by 256-bit bank level encryption</span>
            </p>
          </div>

          {/* Right: Comprehensive Order Summary matching PriceSummaryPanel */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 sm:p-7 rounded-3xl border-2 border-[#1C130E] shadow-xl sticky top-24">
              <h2 className="text-xl font-black text-[#1C130E] mb-5">Order Summary</h2>

              <div className="flex flex-col gap-4 text-xs font-semibold">
                {/* Drop-off Location */}
                <div className="flex items-start gap-2.5 pb-3 border-b border-slate-100">
                  <MapPin className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">Drop-off Location</p>
                    <p className="text-slate-900 font-extrabold text-sm truncate">
                      {dropoffLoc?.name || 'Storage Point'}
                    </p>
                    <p className="text-slate-600 font-semibold text-[11px] mt-0.5">
                      {formatDateTimeDisplay(dropoffTime)}
                    </p>
                    {breakdown.dropoffSurcharge > 0 && (
                      <p className="text-orange-600 font-bold text-[11px] mt-0.5">
                        +{formatUSD(breakdown.dropoffSurcharge)} drop-off surcharge
                      </p>
                    )}
                  </div>
                </div>

                {/* Pick-up Location */}
                <div className="flex items-start gap-2.5 pb-3 border-b border-slate-100">
                  <MapPin className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">Pick-up Location</p>
                    <p className="text-slate-900 font-extrabold text-sm truncate">
                      {pickupLoc?.name || 'Pick-up Point'}
                    </p>
                    <p className="text-slate-600 font-semibold text-[11px] mt-0.5">
                      {formatDateTimeDisplay(pickupTime)}
                    </p>
                    {breakdown.pickupSurcharge > 0 && (
                      <p className="text-orange-600 font-bold text-[11px] mt-0.5">
                        +{formatUSD(breakdown.pickupSurcharge)} pick-up surcharge
                      </p>
                    )}
                  </div>
                </div>

                {/* Duration */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-600 flex-shrink-0" />
                    <span className="text-slate-900 font-bold">Storage Duration</span>
                  </div>
                  <span className="px-3 py-1 bg-orange-100 text-orange-950 font-black rounded-full text-xs">
                    {duration.label}
                  </span>
                </div>

                {/* Stored Items List */}
                {itemsList.length > 0 ? (
                  <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-100">
                    <p className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5 text-orange-600" /> Stored Items & Quantities
                    </p>
                    {itemsList.map(it => {
                      const days = Math.max(1, duration.count || 1);
                      const rate = days > 7 ? it.rateWeekly : it.rateDaily;
                      const lineTotal = rate * it.qty * days;
                      return (
                        <div key={it.tierId} className="flex justify-between items-center text-xs">
                          <div>
                            <span className="font-extrabold text-slate-800">{it.qty}× {it.name}</span>
                            <span className="text-[10px] text-slate-500 font-semibold ml-1.5">
                              ({formatUSD(rate)}/day × {days}d)
                            </span>
                          </div>
                          <span className="font-black text-slate-900">{formatUSD(lineTotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex justify-between items-center py-1 text-xs pb-3 border-b border-slate-100">
                    <span className="font-bold text-slate-800">Storage Items</span>
                    <span className="font-extrabold text-slate-900">{formatUSD(breakdown.itemFee || 0)}</span>
                  </div>
                )}

                {/* Insurance Add-on */}
                {(sessionData?.insuranceEnabled || booking?.insuranceEnabled) && breakdown.insuranceFee > 0 && (
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Item Insurance Protection
                    </span>
                    <span className="font-extrabold text-emerald-700">+{formatUSD(breakdown.insuranceFee)}</span>
                  </div>
                )}

                {/* Grand Total */}
                <div className="pt-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-base font-black text-[#1C130E]">Grand Total</span>
                    <div className="text-right">
                      <p className="text-3xl font-black text-orange-600">{formatUSD(grandTotal)}</p>
                      <p className="text-xs font-bold text-slate-600 mt-0.5">{formatLKR(grandTotal)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Contact Badge */}
              <div className="border-t border-slate-200 pt-5 mt-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Customer Name</p>
                    <p className="text-xs font-bold text-slate-900 truncate">{customerName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Telephone Number (WhatsApp preferred)</p>
                    <p className="text-xs font-bold text-slate-900 truncate">{customerPhone}</p>
                  </div>
                </div>
                {customerEmail && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-orange-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Email Address</p>
                      <p className="text-xs font-bold text-slate-900 truncate">{customerEmail}</p>
                    </div>
                  </div>
                )}
                {customerPassport && (
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-orange-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Passport Number</p>
                      <p className="text-xs font-bold text-slate-900 truncate">{customerPassport}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
