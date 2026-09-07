import { saveBooking } from '@/lib/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateGrandTotal, type TierPricing } from '@/lib/pricing';
import { bookingTouchesAirport } from '@/lib/locations';
import { getSettings } from '@/lib/settings';
import { rateLimit } from '@/lib/security/rateLimit';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { sendBookingConfirmedEmail } from '@/lib/email';
import { consumeOtp } from '@/lib/otp';
import { parseBody, createBookingSchema } from '@/lib/validation/schemas';
import { badRequest, clientIp, fail, ok, serverError, tooManyRequests, NO_STORE } from '@/lib/api/http';
import type { LocationRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings — create a booking.
 *
 * Pricing is recalculated here from live DB rows; the client's totals are
 * only ever an estimate for display. Same for the airport payment rule and
 * the surcharges: whatever the client sends is ignored in favour of the
 * location rows the server just read.
 */
export async function POST(req: Request) {
  try {
    const settings = await getSettings();
    const ip = clientIp(req);

    const limit = rateLimit(`booking:${ip}`, settings.booking_rate_limit, 3600_000);
    if (!limit.allowed) throw tooManyRequests();

    const input = await parseBody(req, createBookingSchema);

    await verifyTurnstile(input.turnstileToken, {
      enabled: settings.turnstile_enabled,
      remoteIp: ip,
    });

    // The customer must have proven ownership of `input.email` via
    // /api/otp/request + /api/otp/verify before we'll create a booking
    // against it. consumeOtp() re-validates verified/unused/window/email
    // match and marks it used — single-use, so this exact verification
    // can't be replayed against a second booking.
    const emailVerified = await consumeOtp(input.emailVerificationId, 'booking_create', input.email);
    if (!emailVerified) {
      throw badRequest('Please verify your email address again before booking.');
    }

    const supabase = createAdminClient();

    // ── Resolve locations ───────────────────────────────────────
    // Accepts a UUID or the seeded code/slug, so links and older clients
    // keep working, but the row itself is always the source of truth.
    const { data: locations, error: locErr } = await supabase.from('locations').select('*').eq('is_active', true);
    if (locErr || !locations?.length) {
      console.error('[bookings.POST] location fetch failed:', locErr);
      throw serverError('We could not load our storage locations. Please try again shortly.');
    }

    const findLocation = (ref: string): LocationRow | undefined =>
      locations.find(
        (l) => l.id === ref || l.code === ref || l.code.toLowerCase() === ref.toLowerCase() || l.name === ref,
      );

    const dropoffLocation = findLocation(input.dropoffLocationId);
    const pickupLocation = findLocation(input.pickupLocationId);
    if (!dropoffLocation) throw badRequest('That drop-off location is not available.');
    if (!pickupLocation) throw badRequest('That pick-up location is not available.');

    // ── Validate the time range against operator limits ─────────
    const dropoffAt = new Date(input.dropoffTime);
    const pickupAt = new Date(input.pickupTime);

    if (pickupAt.getTime() <= dropoffAt.getTime()) {
      throw badRequest('Pick-up time must be after drop-off time.');
    }

    const now = Date.now();
    const leadMs = settings.booking_lead_time_hours * 3600_000;
    if (dropoffAt.getTime() < now - 5 * 60_000) {
      throw badRequest('Drop-off time cannot be in the past.');
    }
    if (leadMs > 0 && dropoffAt.getTime() < now + leadMs) {
      throw badRequest(
        `Bookings must be made at least ${settings.booking_lead_time_hours} hour(s) in advance.`,
      );
    }
    const horizonMs = settings.booking_horizon_days * 86_400_000;
    if (dropoffAt.getTime() > now + horizonMs) {
      throw badRequest(`Drop-off cannot be more than ${settings.booking_horizon_days} days from today.`);
    }

    // ── Item tiers & quantity limits ────────────────────────────
    const { data: dbTiers, error: tierErr } = await supabase
      .from('item_tiers')
      .select('id, code, name, rate_daily_usd, rate_weekly_usd, insurance_fee_usd')
      .eq('is_active', true);

    if (tierErr || !dbTiers?.length) {
      // Fail closed. Falling back to hardcoded rates here would let a DB
      // outage silently bill customers off stale prices.
      console.error('[bookings.POST] tier fetch failed:', tierErr);
      throw serverError('We could not load current pricing. Please try again shortly.');
    }

    const tierByRef = new Map<string, (typeof dbTiers)[number]>();
    for (const t of dbTiers) {
      tierByRef.set(t.id, t);
      tierByRef.set(t.code, t);
    }

    const quantities: Record<string, number> = {};
    let totalUnits = 0;
    for (const item of input.items) {
      if (item.qty <= 0) continue;
      const tier = tierByRef.get(item.tierId);
      if (!tier) throw badRequest('One of the selected item types is no longer available.');
      if (item.qty > settings.max_qty_per_tier) {
        throw badRequest(`You can book at most ${settings.max_qty_per_tier} of any single item type.`);
      }
      quantities[tier.id] = (quantities[tier.id] ?? 0) + item.qty;
      totalUnits += item.qty;
    }

    if (totalUnits === 0) throw badRequest('Select at least one item to store.');
    if (totalUnits > settings.max_items_per_booking) {
      throw badRequest(`A single booking can hold at most ${settings.max_items_per_booking} items.`);
    }

    // ── Price it, server-side ───────────────────────────────────
    const touchesAirport = bookingTouchesAirport(dropoffLocation, pickupLocation);
    const insuranceEnabled = settings.insurance_enabled && input.insuranceEnabled;

    const tiers: TierPricing[] = dbTiers.map((t) => ({
      id: t.id,
      rate_daily_usd: Number(t.rate_daily_usd),
      rate_weekly_usd: Number(t.rate_weekly_usd),
      insurance_fee_usd: Number(t.insurance_fee_usd ?? 0),
    }));

    const breakdown = calculateGrandTotal({
      tiers,
      quantities,
      dropoffISO: input.dropoffTime,
      pickupISO: input.pickupTime,
      dropoffSurchargeUsd: Number(dropoffLocation.dropoff_surcharge_usd ?? 0),
      pickupSurchargeUsd: Number(pickupLocation.pickup_surcharge_usd ?? 0),
      insuranceEnabled,
      config: {
        weekThresholdDays: settings.week_threshold_days,
        minBookingDays: settings.min_booking_days,
      },
    });

    if (!breakdown.duration.valid) throw badRequest('Please choose a valid drop-off and pick-up time.');
    if (breakdown.duration.count > settings.max_booking_days) {
      throw badRequest(`Bookings can run for at most ${settings.max_booking_days} days.`);
    }

    // ── Persist ─────────────────────────────────────────────────
    const record = await saveBooking({
      phone: input.phone,
      fullName: input.fullName,
      email: input.email,
      passportNo: input.passportNo,
      flightNumber: input.flightNumber || undefined,
      notes: input.notes || undefined,
      dropoffLocation,
      pickupLocation,
      dropoffTime: input.dropoffTime,
      pickupTime: input.pickupTime,
      storageStartDate: input.dropoffTime.split('T')[0],
      storageEndDate: input.pickupTime.split('T')[0],
      durationDays: breakdown.duration.count,
      lineItems: breakdown.lineItems,
      insuranceEnabled,
      itemTotalUsd: breakdown.itemFee,
      dropoffSurchargeUsd: breakdown.dropoffSurcharge,
      pickupSurchargeUsd: breakdown.pickupSurcharge,
      insuranceTotalUsd: breakdown.insuranceFee,
      grandTotalUsd: breakdown.grandTotal,
      // Airport bookings are forced to card inside saveBooking regardless.
      requestedPaymentMethod: touchesAirport ? 'stripe' : 'cash',
      idempotencyKey: input.idempotencyKey,
    });

    // Cash bookings are confirmed the moment the customer submits — there's
    // no payment step here, cash is collected in person later. Card
    // bookings are NOT confirmed by email yet: nothing has been paid, so
    // sending "booking confirmed" now would go out before the charge even
    // exists. That email instead fires when the payment actually succeeds
    // (Stripe webhook, or the dev-fallback settle) — see markStripePaymentSucceeded
    // / updateBookingPayment in db.ts and their callers.
    if (record.paymentMethod === 'cash') {
      // Best-effort — a failed send must never fail the booking itself.
      sendBookingConfirmedEmail(record).catch((e) => console.error('[bookings.POST] confirmation email failed:', e));
    }

    return ok({ bookingId: record.id, booking: record, breakdown }, NO_STORE);
  } catch (err) {
    return fail(err, 'bookings.POST');
  }
}

// GET (phone-only lookup) removed — replaced by GET /api/my-bookings, which
// requires a completed email OTP verification. See src/lib/otp.ts.
