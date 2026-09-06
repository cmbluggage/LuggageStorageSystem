'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Button } from '@/components/ui/Button';
import { ItemSelector, type ItemTier } from '@/components/booking/ItemSelector';
import { DateTimePicker } from '@/components/booking/DateTimePicker';
import { LocationSelector, type Location } from '@/components/booking/LocationSelector';
import { PriceSummaryPanel } from '@/components/booking/PriceSummaryPanel';
import { InsuranceToggle } from '@/components/booking/InsuranceToggle';
import { SearchableCountrySelect, type CountryOption } from '@/components/booking/SearchableCountrySelect';
import { calculateGrandTotal } from '@/lib/pricing';
import { TurnstileWidget } from '@/components/booking/TurnstileWidget';
import { bookingTouchesAirport } from '@/lib/locations';
import { DEFAULT_SETTINGS, type PublicSettings } from '@/lib/settings';
import { notify } from '@/lib/toast';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { User, Mail, FileText, Plane, AlertCircle, Phone, ShieldCheck } from 'lucide-react';

/** Public settings shape returned by GET /api/settings. */
const FALLBACK_SETTINGS: PublicSettings = {
  insurance_enabled: DEFAULT_SETTINGS.insurance_enabled,
  insurance_default_on: DEFAULT_SETTINGS.insurance_default_on,
  insurance_label: DEFAULT_SETTINGS.insurance_label,
  week_threshold_days: DEFAULT_SETTINGS.week_threshold_days,
  min_booking_days: DEFAULT_SETTINGS.min_booking_days,
  max_booking_days: DEFAULT_SETTINGS.max_booking_days,
  max_items_per_booking: DEFAULT_SETTINGS.max_items_per_booking,
  max_qty_per_tier: DEFAULT_SETTINGS.max_qty_per_tier,
  booking_lead_time_hours: DEFAULT_SETTINGS.booking_lead_time_hours,
  booking_horizon_days: DEFAULT_SETTINGS.booking_horizon_days,
  usd_to_lkr_rate: DEFAULT_SETTINGS.usd_to_lkr_rate,
  support_phone: DEFAULT_SETTINGS.support_phone,
  support_whatsapp: DEFAULT_SETTINGS.support_whatsapp,
  walkthrough_video_id: DEFAULT_SETTINGS.walkthrough_video_id,
  hotel_location_label: DEFAULT_SETTINGS.hotel_location_label,
  hotel_location_address: DEFAULT_SETTINGS.hotel_location_address,
};

const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', label: 'United States', value: '+1' },
  { code: 'UK', label: 'United Kingdom', value: '+44' },
  { code: 'AU', label: 'Australia', value: '+61' },
  { code: 'IN', label: 'India', value: '+91' },
  { code: 'LK', label: 'Sri Lanka', value: '+94' },
  { code: 'AE', label: 'United Arab Emirates', value: '+971' },
  { code: 'SG', label: 'Singapore', value: '+65' },
  { code: 'MY', label: 'Malaysia', value: '+60' },
  { code: 'MV', label: 'Maldives', value: '+960' },
  { code: 'SA', label: 'Saudi Arabia', value: '+966' },
];

// ─── Step definitions ───────────────────────────────────────────────────────
const STEP_TITLES = [
  '1. Storage Items & Quantities',
  '2. Drop-off & Pick-up Location',
  '3. Storage Dates & Time',
  '4. Contact Details & Insurance',
];

/**
 * Mirrors the server's own checks in POST /api/bookings exactly (same
 * 5-minute grace, same lead-time setting) so a time that will fail at
 * final submit is caught here instead — previously this only surfaced
 * after filling in step 4's contact details, forcing a trip back.
 * Takes `nowMs` explicitly (rather than calling Date.now() itself) so it
 * stays a pure function safe to call from render.
 */
function computeTimeError(dropoffTime: string, pickupTime: string, leadHours: number, nowMs: number): string {
  if (!dropoffTime || !pickupTime) return '';
  const dropoffAt = new Date(dropoffTime).getTime();
  const pickupAt = new Date(pickupTime).getTime();

  if (pickupAt <= dropoffAt) return 'Pick-up time must be after drop-off time.';
  if (dropoffAt < nowMs - 5 * 60_000) return 'Drop-off time cannot be in the past. Please choose a later time.';
  const leadMs = leadHours * 3600_000;
  if (leadMs > 0 && dropoffAt < nowMs + leadMs) {
    return `Bookings must be made at least ${leadHours} hour(s) in advance.`;
  }
  return '';
}

function BookingWizard() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── Dynamic catalog ──────────────────────────────────────────
  const [itemTiers,      setItemTiers]      = useState<ItemTier[]>([]);
  const [locations,      setLocations]      = useState<Location[]>([]);
  const [settings,       setSettings]       = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitError,    setSubmitError]    = useState('');

  // ── Booking state ────────────────────────────────────────────
  const [quantities,    setQuantities]    = useState<Record<string, number>>({});
  const [dropoffId,     setDropoffId]     = useState<string | null>(null);
  const [pickupId,      setPickupId]      = useState<string | null>(null);
  const [dropoffTime,   setDropoffTime]   = useState('');
  const [pickupTime,    setPickupTime]    = useState('');
  const [timeError,     setTimeError]     = useState('');
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);

  // ── Personal details ─────────────────────────────────────────
  const [fullName,      setFullName]      = useState('');
  const [email,         setEmail]         = useState('');
  const [passportNo,    setPassportNo]    = useState('');
  const [flightNumber,  setFlightNumber]  = useState('');
  const [countryCode,   setCountryCode]   = useState('+94');
  const [whatsappNo,    setWhatsappNo]    = useState('');

  // ── Validation ───────────────────────────────────────────────
  const [fullNameError, setFullNameError] = useState('');
  const [emailError,    setEmailError]    = useState('');
  const [passportError, setPassportError] = useState('');
  const [whatsappError, setWhatsappError] = useState('');

  // ── Email verification (OTP) ──────────────────────────────────
  // Resets whenever `email` changes after a code was sent/verified, so a
  // customer can't verify address A then submit with address B.
  const [otpStage,      setOtpStage]      = useState<'idle' | 'sent' | 'verified'>('idle');
  const [otpRequestId,  setOtpRequestId]  = useState<string | null>(null);
  const [otpCode,       setOtpCode]       = useState('');
  const [otpLoading,    setOtpLoading]    = useState(false);
  const [otpError,      setOtpError]      = useState('');
  const [otpCooldown,   setOtpCooldown]   = useState(0);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [otpModalOpen,  setOtpModalOpen]  = useState(false);

  // ── UI state ─────────────────────────────────────────────────
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingStep,    setBookingStep]    = useState(1);

  // ── Fetch catalog data ───────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/locations')
        .then((r) => r.json())
        .then((d) => setLocations(d.locations || []))
        .catch(console.error),

      fetch('/api/item-tiers')
        .then((r) => r.json())
        .then((d) => setItemTiers(d.item_tiers || []))
        .catch(console.error),

      // Business rules (insurance availability, fees, limits) come from the
      // admin panel rather than from constants in this file.
      fetch('/api/settings')
        .then((r) => r.json())
        .then((d) => {
          if (d.settings) setSettings(d.settings);
          if (d.turnstileSiteKey) setTurnstileSiteKey(d.turnstileSiteKey);
        })
        .catch(console.error),
    ]).finally(() => {
      setCatalogLoading(false);
    });
  }, []);

  // ── Restore prior progress, then apply deep-link overrides ───
  const [hasLoaded, setHasLoaded] = useState(false);

  /*
    Restoration stays in an effect rather than a lazy useState initializer:
    sessionStorage is not available during SSR, so seeding state from it at
    render time would make the server and client markup disagree.

    The work is deferred by a microtask so the state updates land outside
    the effect body — a synchronous setState here cascades an extra render
    before paint, which is what React's compiler warns about.
  */
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      try {
        const saved = sessionStorage.getItem('stowaway_booking_state');
        if (saved) {
          const state = JSON.parse(saved);
          if (state.quantities) setQuantities(state.quantities);
          if (state.dropoffId) setDropoffId(state.dropoffId);
          if (state.pickupId) setPickupId(state.pickupId);
          if (state.dropoffTime) setDropoffTime(state.dropoffTime);
          if (state.pickupTime) setPickupTime(state.pickupTime);
          if (state.insuranceEnabled !== undefined) setInsuranceEnabled(state.insuranceEnabled);
          if (state.fullName) setFullName(state.fullName);
          if (state.email) setEmail(state.email);
          if (state.passportNo) setPassportNo(state.passportNo);
          if (state.flightNumber) setFlightNumber(state.flightNumber);
          if (state.countryCode) setCountryCode(state.countryCode);
          if (state.whatsappNo) setWhatsappNo(state.whatsappNo);
          if (state.bookingStep) setBookingStep(state.bookingStep);
        }
      } catch (e) {
        console.warn('[book] could not restore saved progress:', e);
      }

      // A shared link is an explicit intent, so it wins over saved progress.
      const loc = searchParams.get('loc');
      const dTime = searchParams.get('dropoff');
      const pTime = searchParams.get('pickup');
      if (loc) {
        setDropoffId(loc);
        setPickupId(loc);
      }
      if (dTime) setDropoffTime(dTime);
      if (pTime) setPickupTime(pTime);
      if (loc && dTime && pTime) setBookingStep(3);
      else if (loc) setBookingStep(2);

      setHasLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!hasLoaded) return;
    sessionStorage.setItem('stowaway_booking_state', JSON.stringify({
      quantities, dropoffId, pickupId, dropoffTime, pickupTime,
      insuranceEnabled, fullName, email, passportNo, flightNumber,
      countryCode, whatsappNo, bookingStep
    }));
  }, [quantities, dropoffId, pickupId, dropoffTime, pickupTime, insuranceEnabled, fullName, email, passportNo, flightNumber, countryCode, whatsappNo, bookingStep, hasLoaded]);

  // ── Derived values ───────────────────────────────────────────
  const dropoffLocation = locations.find((l) => l.id === dropoffId) ?? null;
  const pickupLocation  = locations.find((l) => l.id === pickupId)  ?? null;

  /**
   * Airport status comes from the shared helper reading the locations'
   * own flags, not from substring-matching their names — the previous
   * check tested for "airport"/"cmb" across ids, codes and names and
   * would misfire on any site with those words in its address.
   *
   * The server re-derives this independently; this copy only drives the UI.
   */
  const isAirportBooking = bookingTouchesAirport(dropoffLocation, pickupLocation);

  /** Insurance can be switched off entirely by the operator. */
  const effectiveInsurance = settings.insurance_enabled && insuranceEnabled;

  const hasItems = Object.values(quantities).some((q) => q > 0);
  const totalUnits = Object.values(quantities).reduce((n, q) => n + q, 0);
  const overItemLimit = totalUnits > settings.max_items_per_booking;

  // ── Navigation ───────────────────────────────────────────────
  const nextStep = () => {
    setBookingStep((s) => Math.min(s + 1, 4));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prevStep = (n: number) => {
    setBookingStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Quantity handlers ────────────────────────────────────────
  const handleQuantityChange = useCallback((tierId: string, delta: number) => {
    setQuantities((prev) => {
      const next    = { ...prev };
      const updated = Math.max(0, (next[tierId] ?? 0) + delta);
      if (updated === 0) delete next[tierId];
      else next[tierId] = updated;
      return next;
    });
  }, []);

  // ── Email verification (OTP) ──────────────────────────────────
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Returns whether the send actually succeeded, so callers can decide what to do next. */
  const requestEmailOtp = async (): Promise<boolean> => {
    const trimmed = email.trim();
    if (!emailRx.test(trimmed)) {
      setEmailError('Please enter a valid email address (e.g. name@example.com).');
      return false;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: trimmed, purpose: 'booking_create' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ?? 'We could not send a verification code. Please try again.';
        setOtpError(msg);
        notify.error(msg);
        return false;
      }
      setOtpRequestId(data.requestId);
      setOtpStage('sent');
      setOtpCooldown(60);
      return true;
    } catch {
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setOtpError(msg);
      notify.error(msg);
      return false;
    } finally {
      setOtpLoading(false);
    }
  };

  /** Verifies the code, then — since verification only ever happens from the modal, right before booking — proceeds straight to submission. */
  const verifyEmailOtpAndContinue = async () => {
    if (!otpRequestId || otpCode.trim().length !== 6) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: otpRequestId, code: otpCode.trim(), purpose: 'booking_create' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.verified) {
        const msg = data?.message ?? 'Incorrect or expired code.';
        setOtpError(msg);
        notify.error(msg);
        return;
      }
      setOtpStage('verified');
      setVerifiedEmail(email.trim());
      setOtpModalOpen(false);
      setOtpCode('');
      notify.success('Email verified.');
      await submitBooking();
    } catch {
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setOtpError(msg);
      notify.error(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailError('');
    // Changing the address after verifying invalidates the verification —
    // the server checks this too, but resetting client state avoids a
    // confusing "verified" badge next to an address that was never checked.
    if (otpStage !== 'idle' && value.trim() !== verifiedEmail) {
      setOtpStage('idle');
      setOtpRequestId(null);
      setOtpCode('');
    }
  };

  // ── Validation ───────────────────────────────────────────────
  const validatePersonalDetails = (): boolean => {
    let valid = true;
    setFullNameError('');
    setEmailError('');
    setPassportError('');
    setWhatsappError('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setFullNameError('Please enter your full name (at least 2 characters).');
      valid = false;
    }
    if (!email.trim() || !emailRx.test(email.trim())) {
      setEmailError('Please enter a valid email address (e.g. name@example.com).');
      valid = false;
    }
    if (!passportNo.trim() || passportNo.trim().length < 3) {
      setPassportError('Please enter your Passport / NIC number (at least 3 characters).');
      valid = false;
    }
    const fullPhone = `${countryCode}${whatsappNo.replace(/\D/g, '')}`;
    if (!whatsappNo.trim() || !isValidPhoneNumber(fullPhone)) {
      setWhatsappError('Please enter a valid WhatsApp number for the selected country.');
      valid = false;
    }
    return valid;
  };

  /**
   * Entry point for the "Confirm & Continue" button. Validates the form,
   * then either submits directly (email already verified for this exact
   * address) or triggers a code send and opens the verify modal — the
   * customer never has to notice/click a separate "send code" button.
   */
  const handleConfirmClick = async () => {
    setSubmitError('');
    if (!validatePersonalDetails()) {
      notify.error('Please fix the errors in your contact details before submitting.');
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      const msg = 'Please complete the verification challenge below.';
      setSubmitError(msg);
      notify.error(msg);
      return;
    }

    if (otpStage === 'verified' && email.trim() === verifiedEmail) {
      await submitBooking();
      return;
    }

    const sent = await requestEmailOtp();
    if (sent) setOtpModalOpen(true);
  };

  const submitBooking = async () => {
    if (!otpRequestId) {
      setSubmitError('Please verify your email address before continuing.');
      return;
    }

    setBookingLoading(true);
    const verifiedPhone = `${countryCode}${whatsappNo.replace(/\D/g, '')}`;

    const calculatedBreakdown = calculateGrandTotal({
      tiers: itemTiers,
      quantities,
      dropoffISO:           dropoffTime,
      pickupISO:            pickupTime,
      dropoffSurchargeUsd:  dropoffLocation?.dropoff_surcharge_usd ?? 0,
      pickupSurchargeUsd:   pickupLocation?.pickup_surcharge_usd  ?? 0,
      insuranceEnabled: effectiveInsurance,
      config: {
        weekThresholdDays: settings.week_threshold_days,
        minBookingDays:    settings.min_booking_days,
      },
    });

    const bookingTempId = `bk-${Date.now().toString(36)}`;
    const selectedTierList = itemTiers
      .filter(t => (quantities[t.id] ?? 0) > 0)
      .map(t => ({
        tierId: t.id,
        name: t.name,
        qty: quantities[t.id] ?? 0,
        rateDaily: t.rate_daily_usd,
        rateWeekly: t.rate_weekly_usd,
        insuranceFee: t.insurance_fee_usd ?? 0,
      }));

    const checkoutSessionPayload = {
      bookingId: bookingTempId,
      phone: verifiedPhone,
      fullName,
      email,
      passportNo,
      flightNumber,
      dropoffLocation,
      pickupLocation,
      dropoffId,
      pickupId,
      dropoffTime,
      pickupTime,
      quantities,
      selectedTiers: selectedTierList,
      insuranceEnabled: effectiveInsurance,
      breakdown: calculatedBreakdown,
      grandTotalUsd: calculatedBreakdown.grandTotal,
      isAirportBooking,
      allowsCash: !isAirportBooking,
      createdAt: new Date().toISOString(),
    };

    /*
      The booking must exist on the server before we move on.

      The previous version pushed to /checkout/<temp-id> in the catch
      block — so a network failure or a rejected booking still produced a
      checkout page and, past it, a confirmation and QR pass for something
      that was never stored. Failures now stay on this page with the
      server's reason, and the customer's inputs are preserved.
    */
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: verifiedPhone,
          fullName,
          email,
          passportNo,
          flightNumber,
          dropoffLocationId: dropoffId,
          pickupLocationId:  pickupId,
          dropoffTime,
          pickupTime,
          items: Object.entries(quantities).map(([tierId, qty]) => ({ tierId, qty })),
          insuranceEnabled: effectiveInsurance,
          turnstileToken: turnstileToken ?? undefined,
          // Stable for this attempt, so a double-click or a retry after a
          // timeout returns the original booking instead of a duplicate.
          idempotencyKey: bookingTempId,
          emailVerificationId: otpRequestId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.bookingId) {
        const msg = data?.error ?? 'We could not complete your booking. Please try again.';
        setSubmitError(msg);
        notify.error(msg);
        setTurnstileToken(null); // tokens are single-use
        return;
      }

      checkoutSessionPayload.bookingId = data.bookingId;
      if (data.breakdown) checkoutSessionPayload.breakdown = data.breakdown;
      if (typeof data.booking?.grandTotalUsd === 'number') {
        checkoutSessionPayload.grandTotalUsd = data.booking.grandTotalUsd;
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('stowaway_checkout_session', JSON.stringify(checkoutSessionPayload));
        sessionStorage.removeItem('stowaway_booking_state');
      }

      notify.success('Booking initialized! Proceeding to checkout...');
      router.push(`/checkout/${data.bookingId}`);
    } catch (err) {
      console.error('[book] booking request failed:', err);
      const msg = 'We could not reach our servers. Check your connection and try again.';
      setSubmitError(msg);
      notify.error(msg);
      setTurnstileToken(null);
    } finally {
      setBookingLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#1C130E] tracking-tight">
            Book your storage
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Left: Wizard ──────────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Progress indicator */}
            <div className="mb-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-3">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {bookingStep}
                  </span>
                  <span className="text-sm font-bold text-[#1C130E] truncate">
                    {STEP_TITLES[bookingStep - 1]}
                  </span>
                </span>
                <span className="text-slate-400 font-bold flex-shrink-0 ml-2">Step {bookingStep} of 4</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={s > bookingStep}
                    onClick={() => setBookingStep(s)}
                    className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                      s <= bookingStep ? 'bg-orange-600' : 'bg-slate-200'
                    }`}
                    title={`Step ${s}`}
                  />
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 sm:p-8 rounded-2xl shadow-2xs">

              {/* ── Step 1: Items ──────────────────────────────── */}
              {bookingStep === 1 && (
                <div className="animate-fade-in">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                    What are you storing?
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mb-6">
                    Select the items and quantities you want to store.
                  </p>
                  <ItemSelector
                    tiers={itemTiers}
                    quantities={quantities}
                    onQuantityChange={handleQuantityChange}
                    loading={catalogLoading}
                  />
                  {/* The same cap is enforced server-side; surfacing it here
                      stops the customer reaching step 4 before being told. */}
                  {overItemLimit && (
                    <div
                      role="alert"
                      className="mt-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5
                                 text-xs font-bold text-amber-900"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-px" />
                      <span>
                        A single booking can hold up to {settings.max_items_per_booking} items. Please reduce
                        your selection, or message us on WhatsApp to arrange a larger drop-off.
                      </span>
                    </div>
                  )}

                  <div className="mt-8 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-400 tabular-nums">
                      {totalUnits > 0 && `${totalUnits} item${totalUnits === 1 ? '' : 's'} selected`}
                    </span>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={nextStep}
                      disabled={!hasItems || overItemLimit}
                    >
                      Select Location →
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Location ───────────────────────────── */}
              {bookingStep === 2 && (
                <div className="animate-fade-in">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6">
                    Where are you dropping off & picking up?
                  </h3>
                  <LocationSelector
                    locations={locations}
                    dropoffId={dropoffId}
                    pickupId={pickupId}
                    onDropoffChange={setDropoffId}
                    onPickupChange={setPickupId}
                  />
                  <div className="mt-8 flex items-center justify-between gap-3">
                    <Button variant="secondary" size="md" onClick={() => prevStep(1)}>Back</Button>
                    <Button variant="primary" size="md" onClick={nextStep} disabled={!dropoffId || !pickupId}>
                      Select Time →
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Time ───────────────────────────────── */}
              {bookingStep === 3 && (
                <div className="animate-fade-in">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6">
                    When do you need storage?
                  </h3>
                  <DateTimePicker
                    dropoffTime={dropoffTime}
                    pickupTime={pickupTime}
                    onDropoffChange={(v) => { setDropoffTime(v); setTimeError(''); }}
                    onPickupChange={(v) => { setPickupTime(v); setTimeError(''); }}
                  />
                  {timeError && (
                    <div
                      role="alert"
                      className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs font-bold text-red-800"
                    >
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span>{timeError}</span>
                    </div>
                  )}
                  <div className="mt-8 flex items-center justify-between gap-3">
                    <Button variant="secondary" size="md" onClick={() => prevStep(2)}>Back</Button>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        const err = computeTimeError(dropoffTime, pickupTime, settings.booking_lead_time_hours, Date.now());
                        if (err) { setTimeError(err); return; }
                        setTimeError('');
                        nextStep();
                      }}
                      disabled={!dropoffTime || !pickupTime}
                    >
                      Enter Details →
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Step 4: Details + Insurance ────────────────── */}
              {bookingStep === 4 && (
                <div className="animate-fade-in">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                    Personal Information
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mb-6">
                    Your digital receipt & QR pass will be sent to your email.
                  </p>

                    <div className="flex flex-col gap-5">
                      {/* Full Name */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-orange-600" /> Full Name *
                        </label>
                        <input
                          type="text"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => { setFullName(e.target.value); setFullNameError(''); }}
                          className={`w-full bg-slate-50 border rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none transition-all ${
                            fullNameError
                              ? 'border-red-500 ring-2 ring-red-500/20'
                              : 'border-slate-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20'
                          }`}
                        />
                        {fullNameError && (
                          <p className="text-xs font-semibold text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {fullNameError}
                          </p>
                        )}
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-orange-600" /> Email Address (for receipt) *
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="john@example.com"
                            value={email}
                            onChange={(e) => handleEmailChange(e.target.value)}
                            className={`flex-1 bg-slate-50 border rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none transition-all ${
                              emailError
                                ? 'border-red-500 ring-2 ring-red-500/20'
                                : 'border-slate-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20'
                            }`}
                          />
                          {otpStage === 'verified' && email.trim() === verifiedEmail && (
                            <span className="flex items-center gap-1.5 px-3 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex-shrink-0">
                              <ShieldCheck className="w-4 h-4" /> Verified
                            </span>
                          )}
                        </div>
                        {emailError && (
                          <p className="text-xs font-semibold text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {emailError}
                          </p>
                        )}
                        <p className="text-[11px] font-medium text-slate-400 mt-1.5">
                          We&apos;ll email you a quick verification code when you continue.
                        </p>
                      </div>

                      {/* WhatsApp */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-orange-600" /> WhatsApp Number *
                        </label>
                        <div className="flex gap-3">
                          <div className="w-[140px] flex-shrink-0">
                            <SearchableCountrySelect
                              options={COUNTRY_OPTIONS}
                              value={countryCode}
                              onChange={setCountryCode}
                            />
                          </div>
                          <div className="flex-1">
                            <input
                              type="tel"
                              placeholder="77 123 4567"
                              value={whatsappNo}
                              onChange={(e) => { setWhatsappNo(e.target.value); setWhatsappError(''); }}
                              className={`w-full bg-slate-50 border rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none transition-all ${
                                whatsappError
                                  ? 'border-red-500 ring-2 ring-red-500/20'
                                  : 'border-slate-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20'
                              }`}
                            />
                          </div>
                        </div>
                        {whatsappError && (
                          <p className="text-xs font-semibold text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {whatsappError}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Passport */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-orange-600" /> Passport / NIC Number *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. N1234567"
                          value={passportNo}
                          onChange={(e) => { setPassportNo(e.target.value); setPassportError(''); }}
                          className={`w-full bg-slate-50 border rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none transition-all ${
                            passportError
                              ? 'border-red-500 ring-2 ring-red-500/20'
                              : 'border-slate-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20'
                          }`}
                        />
                        {passportError && (
                          <p className="text-xs font-semibold text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {passportError}
                          </p>
                        )}
                      </div>
                      {/* Arrival Flight Number */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <Plane className="w-3.5 h-3.5 text-slate-400" /> Arrival Flight Number (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. UL 504"
                          value={flightNumber}
                          onChange={(e) => setFlightNumber(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 focus:border-orange-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-600/20 transition-all"
                        />
                      </div>
                    </div>

                    {/* Insurance is hidden entirely when the operator has
                        switched it off in the admin panel. */}
                    {settings.insurance_enabled && (
                      <div className="pt-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                          {settings.insurance_label}
                        </p>
                        <InsuranceToggle
                          enabled={insuranceEnabled}
                          onChange={setInsuranceEnabled}
                          tiers={itemTiers}
                          quantities={quantities}
                        />
                      </div>
                    )}
                  </div>

                  {turnstileSiteKey && (
                    <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
                  )}

                  {submitError && (
                    <div
                      role="alert"
                      className="mt-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5
                                 text-xs font-bold text-red-800"
                    >
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="mt-8 flex items-center justify-between gap-3">
                    <Button variant="secondary" size="md" onClick={() => prevStep(3)}>Back</Button>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleConfirmClick}
                      loading={bookingLoading || (otpLoading && !otpModalOpen)}
                    >
                      Confirm & Continue →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Price Summary ───────────────────────────── */}
          <div className="lg:col-span-1 sticky top-24">
            <PriceSummaryPanel
              tiers={itemTiers}
              quantities={quantities}
              dropoffTime={dropoffTime}
              pickupTime={pickupTime}
              dropoffLocation={dropoffLocation}
              pickupLocation={pickupLocation}
              insuranceEnabled={effectiveInsurance}
              config={{
                weekThresholdDays: settings.week_threshold_days,
                minBookingDays:    settings.min_booking_days,
              }}
            />
          </div>
        </div>
      </main>

      {otpModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="otp-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 sm:p-7 animate-fade-in">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4">
              <Mail className="w-6 h-6" />
            </div>
            <h2 id="otp-modal-title" className="text-lg font-bold text-slate-900 mb-1.5">
              Verify your email
            </h2>
            <p className="text-sm font-medium text-slate-500 mb-5">
              We&apos;ve sent a 6-digit code to <span className="font-bold text-slate-700">{email.trim()}</span>.
              Enter it below to confirm your booking.
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={otpCode}
              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && otpCode.length === 6) verifyEmailOtpAndContinue(); }}
              placeholder="123456"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3.5 text-2xl font-black tracking-[0.5em] text-center text-slate-900 placeholder-slate-300 focus:outline-none focus:border-orange-600 focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
            />
            {otpError && (
              <p className="text-xs font-semibold text-red-600 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {otpError}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-5"
              loading={otpLoading}
              disabled={otpCode.length !== 6}
              onClick={verifyEmailOtpAndContinue}
            >
              Verify & Book →
            </Button>

            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => { setOtpModalOpen(false); setOtpCode(''); setOtpError(''); }}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestEmailOtp}
                disabled={otpCooldown > 0 || otpLoading}
                className="text-xs font-bold text-orange-700 hover:text-orange-800 disabled:text-slate-300 disabled:cursor-not-allowed"
              >
                {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend code'}
              </button>
            </div>
            <p className="text-[11px] font-medium text-slate-400 mt-3 text-center">
              Don&apos;t see it? Check your spam or junk folder.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold">Loading booking engine...</div>}>
      <BookingWizard />
    </Suspense>
  );
}
