import { createAdminClient } from '@/lib/supabase/admin';
import { badRequest, conflict, notFound, serverError } from '@/lib/api/http';
import { bookingTouchesAirport, isAirportLocation, resolvePayment, toApiMethod } from '@/lib/locations';
import type { PaymentMethodApi, PaymentStatus } from '@/lib/locations';
import { calculateGrandTotal, round2, type LineItem, type TierPricing } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';
import { isStripeConfigured } from '@/lib/stripe';
import type { LocationRow } from '@/lib/supabase/types';
import type { BookingEditInput } from '@/lib/validation/schemas';

/**
 * Supabase data-access layer for bookings.
 *
 * Design notes worth keeping:
 *  - All writes use the service-role client. Since migration 004 the anon
 *    role has no write grants, so this is the only path in.
 *  - Failures throw. The previous implementation caught every Supabase
 *    error, logged a console.warn, kept an in-memory copy and still
 *    returned a "successful" record — so customers were shown confirmation
 *    pages and QR passes for bookings that had never been persisted. A
 *    booking we cannot store is a booking that did not happen.
 *  - Airport/cash rules come from `src/lib/locations.ts` only.
 */

export interface BookingItemDetail {
  tierId: string;
  qty: number;
  unitRateUsd: number;
  lineTotalUsd: number;
  tierName?: string;
  tierCode?: string;
  iconEmoji?: string;
}

export interface BookingRecord {
  id: string;
  customerId: string;
  phone: string;
  fullName: string;
  email: string;
  passportNo: string;
  flightNumber: string | null;
  notes: string | null;
  dropoffLocationId: string;
  pickupLocationId: string;
  dropoffLocationName: string;
  pickupLocationName: string;
  dropoffTime: string;
  pickupTime: string;
  storageStartDate: string;
  storageEndDate: string;
  durationDays: number;
  items: BookingItemDetail[];
  insuranceEnabled: boolean;
  itemTotalUsd: number;
  dropoffSurchargeUsd: number;
  pickupSurchargeUsd: number;
  insuranceTotalUsd: number;
  grandTotalUsd: number;
  paymentMethod: PaymentMethodApi;
  /**
   * Derived from the `payments` ledger (grandTotalUsd vs. the sum of
   * succeeded payments), not read directly off the stored column — the
   * column is a cache kept in sync for filtering, the ledger is the
   * authority. See `amountPaidUsd`/`balanceDueUsd`.
   */
  paymentStatus: PaymentStatus;
  /** Sum of succeeded payments (cash collections + settled Stripe charges). */
  amountPaidUsd: number;
  /** grandTotalUsd - amountPaidUsd, floored at 0. What's left to collect. */
  balanceDueUsd: number;
  status: 'confirmed' | 'in_transit' | 'deposited' | 'picked_up' | 'cancelled';
  qrCodeToken: string;
  allowsCash: boolean;
  isAirportBooking: boolean;
  /** Set once a staff member marks a cash payment as physically collected. */
  cashCollectedByName: string | null;
  cashCollectedAt: string | null;
  createdAt: string;
}

/** Everything the booking route has already validated and priced. */
export interface SaveBookingInput {
  phone: string;
  fullName: string;
  email?: string;
  passportNo: string;
  flightNumber?: string;
  notes?: string;
  dropoffLocation: LocationRow;
  pickupLocation: LocationRow;
  dropoffTime: string;
  pickupTime: string;
  storageStartDate: string;
  storageEndDate: string;
  durationDays: number;
  lineItems: LineItem[];
  insuranceEnabled: boolean;
  itemTotalUsd: number;
  dropoffSurchargeUsd: number;
  pickupSurchargeUsd: number;
  insuranceTotalUsd: number;
  grandTotalUsd: number;
  requestedPaymentMethod?: PaymentMethodApi;
  idempotencyKey?: string;
}

/** Columns needed to map a booking row into a BookingRecord. */
const BOOKING_SELECT = `
  *,
  customers!inner(id, phone, full_name, email, passport_number),
  booking_items(tier_id, quantity, unit_rate_usd, line_total_usd, item_tiers(code, name, icon_emoji)),
  dropoff_loc:locations!dropoff_location_id(id, code, name, is_airport, allows_cash, requires_stripe),
  pickup_loc:locations!pickup_location_id(id, code, name, is_airport, allows_cash, requires_stripe),
  collector:staff!cash_collected_by(full_name),
  payments(amount_usd, method, status, created_at)
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embedded
   selects are not expressible in the hand-maintained Database type; the
   shape is normalised immediately below in mapBooking. */

/** Ledger-derived status — the authority, never the raw stored column. */
function derivePaymentStatus(grandTotalUsd: number, amountPaidUsd: number): PaymentStatus {
  if (round2(grandTotalUsd) <= 0) return 'paid';
  if (amountPaidUsd <= 0) return 'pending';
  if (round2(amountPaidUsd) >= round2(grandTotalUsd)) return 'paid';
  return 'partially_paid';
}

function mapBooking(b: any): BookingRecord {
  const dropoffLoc = b.dropoff_loc ?? null;
  const pickupLoc = b.pickup_loc ?? null;
  const isAirport = bookingTouchesAirport(dropoffLoc, pickupLoc);

  const grandTotalUsd = Number(b.grand_total_usd ?? 0);
  const amountPaidUsd = round2(
    (b.payments ?? [])
      .filter((p: any) => p.status === 'succeeded')
      .reduce((sum: number, p: any) => sum + Number(p.amount_usd ?? 0), 0),
  );
  const balanceDueUsd = Math.max(0, round2(grandTotalUsd - amountPaidUsd));

  const items: BookingItemDetail[] = (b.booking_items ?? []).map((bi: any) => ({
    tierId: bi.tier_id,
    qty: bi.quantity,
    unitRateUsd: Number(bi.unit_rate_usd ?? 0),
    lineTotalUsd: Number(bi.line_total_usd ?? 0),
    tierName: bi.item_tiers?.name,
    tierCode: bi.item_tiers?.code,
    iconEmoji: bi.item_tiers?.icon_emoji,
  }));

  return {
    id: b.id,
    customerId: b.customer_id,
    phone: b.customers?.phone ?? '',
    fullName: b.customers?.full_name ?? '',
    email: b.customers?.email ?? '',
    passportNo: b.customers?.passport_number ?? '',
    flightNumber: b.flight_number ?? null,
    notes: b.notes ?? null,
    dropoffLocationId: dropoffLoc?.id ?? b.dropoff_location_id,
    pickupLocationId: pickupLoc?.id ?? b.pickup_location_id,
    dropoffLocationName: dropoffLoc?.name ?? 'Storage Hub',
    pickupLocationName: pickupLoc?.name ?? 'Storage Hub',
    dropoffTime: b.dropoff_time ?? b.storage_start_date,
    pickupTime: b.pickup_time ?? b.storage_end_date,
    storageStartDate: b.storage_start_date,
    storageEndDate: b.storage_end_date,
    durationDays: Number(b.duration_days ?? b.duration_value ?? 1),
    items,
    insuranceEnabled: Boolean(b.insurance_enabled ?? Number(b.insurance_total_usd) > 0),
    itemTotalUsd: Number(b.item_total_usd ?? 0),
    dropoffSurchargeUsd: Number(b.dropoff_surcharge_usd ?? 0),
    pickupSurchargeUsd: Number(b.pickup_surcharge_usd ?? 0),
    insuranceTotalUsd: Number(b.insurance_total_usd ?? 0),
    grandTotalUsd,
    // An airport booking is card-only no matter what the column says.
    paymentMethod: isAirport ? 'stripe' : toApiMethod(b.payment_method),
    paymentStatus: derivePaymentStatus(grandTotalUsd, amountPaidUsd),
    amountPaidUsd,
    balanceDueUsd,
    status: b.booking_status ?? 'confirmed',
    qrCodeToken: b.qr_code_token ?? '',
    allowsCash: !isAirport,
    isAirportBooking: isAirport,
    cashCollectedByName: b.collector?.full_name ?? null,
    cashCollectedAt: b.cash_collected_at ?? null,
    createdAt: b.created_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a fully-priced booking.
 *
 * Ordering matters: the booking row is written first, then its line items.
 * If the line-item insert fails we delete the parent row rather than leave
 * a booking with no contents. Postgres has no cross-statement transaction
 * over PostgREST, so this compensating delete is the available guarantee —
 * move to a `create_booking` RPC if you need true atomicity.
 */
export async function saveBooking(input: SaveBookingInput): Promise<BookingRecord> {
  const supabase = createAdminClient();

  const touchesAirport = bookingTouchesAirport(input.dropoffLocation, input.pickupLocation);
  const payment = resolvePayment(input.requestedPaymentMethod, undefined, touchesAirport);

  // Idempotency: a retried or double-clicked submit returns the original.
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (existing?.id) {
      const prior = await getBookingById(existing.id);
      if (prior) return prior;
    }
  }

  // ── 1. Resolve or create the customer ───────────────────────────
  const phone = input.phone.trim();
  let customerId: string;

  const { data: existingCustomer, error: custLookupErr } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (custLookupErr) {
    console.error('[db.saveBooking] customer lookup failed:', custLookupErr);
    throw serverError('We could not verify your details. Please try again.');
  }

  if (existingCustomer?.id) {
    customerId = existingCustomer.id;
    const { error } = await supabase
      .from('customers')
      .update({
        full_name: input.fullName,
        email: input.email || null,
        passport_number: input.passportNo,
      })
      .eq('id', customerId);
    if (error) console.error('[db.saveBooking] customer update failed:', error);
  } else {
    const { data: created, error } = await supabase
      .from('customers')
      .insert({
        phone,
        full_name: input.fullName,
        email: input.email || null,
        passport_number: input.passportNo,
      })
      .select('id')
      .single();
    if (error || !created?.id) {
      console.error('[db.saveBooking] customer insert failed:', error);
      throw serverError('We could not save your details. Please try again.');
    }
    customerId = created.id;
  }

  // ── 2. Insert the booking ───────────────────────────────────────
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      customer_id: customerId,
      dropoff_location_id: input.dropoffLocation.id,
      pickup_location_id: input.pickupLocation.id,
      duration_unit: 'days',
      duration_value: input.durationDays,
      duration_days: input.durationDays,
      dropoff_time: input.dropoffTime,
      pickup_time: input.pickupTime,
      storage_start_date: input.storageStartDate,
      storage_end_date: input.storageEndDate,
      item_total_usd: input.itemTotalUsd,
      dropoff_surcharge_usd: input.dropoffSurchargeUsd,
      pickup_surcharge_usd: input.pickupSurchargeUsd,
      insurance_total_usd: input.insuranceTotalUsd,
      insurance_enabled: input.insuranceEnabled,
      grand_total_usd: input.grandTotalUsd,
      payment_method: payment.method,
      // Never 'paid' at insert time — recording an actual payment (cash
      // collection, a settled Stripe charge, or the no-Stripe-configured
      // dev fallback) is what moves this, via recordPayment() below. The
      // ledger is the authority; this column is just the initial cache.
      payment_status: 'pending',
      booking_status: 'confirmed',
      flight_number: input.flightNumber || null,
      notes: input.notes || null,
      idempotency_key: input.idempotencyKey || null,
    })
    .select('id')
    .single();

  if (bookingErr || !booking?.id) {
    // Unique violation on the idempotency key: a concurrent duplicate won.
    if (bookingErr?.code === '23505' && input.idempotencyKey) {
      const { data: raced } = await supabase
        .from('bookings')
        .select('id')
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();
      if (raced?.id) {
        const prior = await getBookingById(raced.id);
        if (prior) return prior;
      }
    }
    console.error('[db.saveBooking] booking insert failed:', bookingErr);
    throw serverError('We could not complete your booking. No charge was made — please try again.');
  }

  // ── 3. Insert line items, with the agreed rates snapshotted ─────
  if (input.lineItems.length > 0) {
    const { error: itemsErr } = await supabase.from('booking_items').insert(
      input.lineItems.map((l) => ({
        booking_id: booking.id,
        tier_id: l.tierId,
        quantity: l.qty,
        unit_rate_usd: l.unitRateUsd,
        line_total_usd: l.lineTotalUsd,
      })),
    );

    if (itemsErr) {
      console.error('[db.saveBooking] line items failed, rolling back booking:', itemsErr);
      await supabase.from('bookings').delete().eq('id', booking.id);
      throw serverError('We could not complete your booking. No charge was made — please try again.');
    }
  }

  const saved = await getBookingById(booking.id);
  if (!saved) throw serverError('Your booking was created but could not be read back. Contact support with this time.');
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getBookingById(id: string): Promise<BookingRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle();

  if (error) {
    console.error('[db.getBookingById] failed:', error);
    throw serverError('We could not load that booking. Please try again.');
  }
  return data ? mapBooking(data) : null;
}

export async function getBookingsByPhone(phone: string): Promise<BookingRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('customers.phone', phone.trim())
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[db.getBookingsByPhone] failed:', error);
    throw serverError('We could not load your bookings. Please try again.');
  }
  return (data ?? []).map(mapBooking);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments ledger
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordPaymentInput {
  bookingId: string;
  amountUsd: number;
  method: 'cash' | 'stripe';
  status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  /** staff.user_id — cash collections only. */
  collectedBy?: string;
}

/**
 * Insert a payment ledger row and, when it settles, refresh the booking's
 * cached `payment_status` from the ledger.
 *
 * This is the only function that ever writes to `payments` — cash
 * collection, a settled Stripe webhook, and the no-Stripe-configured dev
 * fallback all go through here, so the ledger and the cached status column
 * can never drift apart between the different payment paths.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<BookingRecord> {
  const supabase = createAdminClient();
  const status = input.status ?? 'succeeded';

  const { error: insertErr } = await supabase.from('payments').insert({
    booking_id: input.bookingId,
    amount_usd: input.amountUsd,
    method: input.method,
    status,
    stripe_session_id: input.stripeSessionId ?? null,
    stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
    collected_by: input.collectedBy ?? null,
  } as never);

  if (insertErr) {
    // A stripe_session_id unique violation means a webhook retry landed
    // here — the first insert already recorded it, so this is not an error.
    if (insertErr.code === '23505' && input.stripeSessionId) {
      const existing = await getBookingById(input.bookingId);
      if (existing) return existing;
    }
    console.error('[db.recordPayment] insert failed:', insertErr);
    throw serverError('We could not record that payment. Please try again.');
  }

  let updated = await getBookingById(input.bookingId);
  if (!updated) throw notFound('Booking not found.');

  if (status === 'succeeded') {
    const bookingUpdate: Record<string, unknown> = { payment_status: updated.paymentStatus };
    if (input.method === 'cash') {
      bookingUpdate.cash_collected_by = input.collectedBy ?? null;
      bookingUpdate.cash_collected_at = new Date().toISOString();
    }
    const { error: updateErr } = await supabase.from('bookings').update(bookingUpdate as never).eq('id', input.bookingId);
    if (updateErr) console.error('[db.recordPayment] cache sync failed:', updateErr);

    // Re-fetch so the returned record picks up cash_collected_by's embed.
    if (input.method === 'cash') {
      const refreshed = await getBookingById(input.bookingId);
      if (refreshed) updated = refreshed;
    }
  }

  return updated;
}

/** Create the pending ledger row for a Stripe Checkout Session before redirecting. */
export async function createPendingStripePayment(
  bookingId: string,
  amountUsd: number,
  stripeSessionId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('payments').insert({
    booking_id: bookingId,
    amount_usd: amountUsd,
    method: 'stripe',
    status: 'pending',
    stripe_session_id: stripeSessionId,
  } as never);

  if (error) {
    console.error('[db.createPendingStripePayment] failed:', error);
    throw serverError('We could not start that payment. Please try again.');
  }
}

/**
 * Called from the Stripe webhook when a Checkout Session completes.
 * Idempotent: a replayed webhook for an already-succeeded session is a
 * no-op, not an error. Returns null for a session id this app never
 * created (the webhook handler 200s regardless — nothing to retry).
 */
export async function markStripePaymentSucceeded(
  stripeSessionId: string,
  stripePaymentIntentId?: string,
): Promise<BookingRecord | null> {
  const supabase = createAdminClient();

  const { data: existing, error: readErr } = await supabase
    .from('payments')
    .select('id, booking_id, status')
    .eq('stripe_session_id', stripeSessionId)
    .maybeSingle();

  if (readErr) {
    console.error('[db.markStripePaymentSucceeded] read failed:', readErr);
    throw serverError('We could not confirm that payment.');
  }
  if (!existing) return null;
  if (existing.status === 'succeeded') return getBookingById(existing.booking_id);

  const { error: updateErr } = await supabase
    .from('payments')
    .update({ status: 'succeeded', stripe_payment_intent_id: stripePaymentIntentId ?? null } as never)
    .eq('id', existing.id);
  if (updateErr) {
    console.error('[db.markStripePaymentSucceeded] update failed:', updateErr);
    throw serverError('We could not confirm that payment.');
  }

  const updated = await getBookingById(existing.booking_id);
  if (updated) {
    await supabase.from('bookings').update({ payment_status: updated.paymentStatus } as never).eq('id', existing.booking_id);
  }
  return updated;
}

/** Called from the webhook when a Checkout Session expires or its payment fails. */
export async function markStripePaymentFailed(stripeSessionId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('payments')
    .update({ status: 'failed' } as never)
    .eq('stripe_session_id', stripeSessionId)
    .eq('status', 'pending');
  if (error) console.error('[db.markStripePaymentFailed] failed:', stripeSessionId, error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the payment method on an existing booking, used by the customer-
 * facing checkout step.
 *
 * The airport lockout is re-derived from the booking's own location rows,
 * never from the caller's payload — a client asking to pay cash for an
 * airport booking is silently corrected to card, not trusted.
 *
 * Card payments are only ever settled *here* — instantly, no real charge —
 * when there is no live Stripe key configured (local dev / a demo). Once
 * Stripe is configured, every card payment is settled exclusively through
 * `POST /api/bookings/[id]/checkout` + the webhook, never by this PATCH;
 * calling it with `stripe` at that point is a client bug, not a payment
 * method to silently fall back on.
 */
export async function updateBookingPayment(
  id: string,
  requestedMethod: PaymentMethodApi,
  requestedStatus: PaymentStatus,
): Promise<BookingRecord> {
  const supabase = createAdminClient();

  const { data: current, error: readErr } = await supabase
    .from('bookings')
    .select(
      `id, payment_status, grand_total_usd,
       dropoff_loc:locations!dropoff_location_id(is_airport, code, requires_stripe, allows_cash),
       pickup_loc:locations!pickup_location_id(is_airport, code, requires_stripe, allows_cash)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (readErr) {
    console.error('[db.updateBookingPayment] read failed:', readErr);
    throw serverError('We could not load that booking. Please try again.');
  }
  if (!current) throw notFound('Booking not found.');

  const row = current as any;
  if (row.payment_status === 'paid') {
    throw conflict('This booking has already been paid.');
  }

  const touchesAirport = bookingTouchesAirport(row.dropoff_loc, row.pickup_loc);
  const payment = resolvePayment(requestedMethod, requestedStatus, touchesAirport);

  if (payment.method === 'stripe_simulated') {
    if (isStripeConfigured()) {
      throw badRequest('Card payments are handled by the secure checkout flow. Use /api/bookings/[id]/checkout.');
    }
    return recordPayment({ bookingId: id, amountUsd: Number(row.grand_total_usd ?? 0), method: 'stripe' });
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ payment_method: payment.method } as never)
    .eq('id', id);

  if (updateErr) {
    console.error('[db.updateBookingPayment] update failed:', updateErr);
    throw serverError('We could not record your payment preference. Please try again.');
  }

  const updated = await getBookingById(id);
  if (!updated) throw notFound('Booking not found.');
  return updated;
}

/**
 * Staff/SuperAdmin action: edit a booking's customer details, notes, or
 * schedule (location + time).
 *
 * An edit is never blocked by payment status — if a location/time change
 * recalculates a different grand total, `payment_status` is simply
 * re-derived from the payments ledger against the new total (paid /
 * partially_paid / pending). Extending a stay that was already paid in
 * full naturally becomes `partially_paid`, and the amount still owed is
 * `balanceDueUsd` on the returned record — staff collect exactly that via
 * `markCashCollected` or a fresh Stripe Checkout Session, never the whole
 * new total from scratch.
 */
export async function updateBookingDetails(
  id: string,
  patch: BookingEditInput,
): Promise<{ booking: BookingRecord; balanceNowDue: boolean }> {
  const supabase = createAdminClient();

  const { data: current, error: readErr } = await supabase
    .from('bookings')
    .select(
      `id, customer_id, payment_status, grand_total_usd, insurance_total_usd, dropoff_time, pickup_time,
       dropoff_location_id, pickup_location_id,
       booking_items(tier_id, quantity)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (readErr) {
    console.error('[db.updateBookingDetails] read failed:', readErr);
    throw serverError('We could not load that booking. Please try again.');
  }
  if (!current) throw notFound('Booking not found.');

  const row = current as any;
  const scheduleChanged =
    (patch.dropoffLocationId && patch.dropoffLocationId !== row.dropoff_location_id) ||
    (patch.pickupLocationId && patch.pickupLocationId !== row.pickup_location_id) ||
    (patch.dropoffTime && patch.dropoffTime !== row.dropoff_time) ||
    (patch.pickupTime && patch.pickupTime !== row.pickup_time);

  const bookingUpdate: Record<string, unknown> = {};
  let balanceNowDue = false;

  if (patch.notes !== undefined) bookingUpdate.notes = patch.notes || null;
  if (patch.flightNumber !== undefined) bookingUpdate.flight_number = patch.flightNumber || null;

  if (scheduleChanged) {
    const [{ data: locations, error: locErr }, { data: tiers, error: tierErr }, settings] = await Promise.all([
      supabase.from('locations').select('*').eq('is_active', true),
      supabase.from('item_tiers').select('id, rate_daily_usd, rate_weekly_usd, insurance_fee_usd'),
      getSettings(),
    ]);
    if (locErr || !locations?.length) {
      console.error('[db.updateBookingDetails] location fetch failed:', locErr);
      throw serverError('We could not load storage locations. Please try again.');
    }
    if (tierErr) {
      console.error('[db.updateBookingDetails] tier fetch failed:', tierErr);
      throw serverError('We could not load current pricing. Please try again.');
    }

    const dropoffLocationId = patch.dropoffLocationId ?? row.dropoff_location_id;
    const pickupLocationId = patch.pickupLocationId ?? row.pickup_location_id;
    const dropoffLocation = locations.find((l) => l.id === dropoffLocationId);
    const pickupLocation = locations.find((l) => l.id === pickupLocationId);
    if (!dropoffLocation) throw badRequest('That drop-off location is not available.');
    if (!pickupLocation) throw badRequest('That pick-up location is not available.');

    const dropoffTime = patch.dropoffTime ?? row.dropoff_time;
    const pickupTime = patch.pickupTime ?? row.pickup_time;
    if (new Date(pickupTime).getTime() <= new Date(dropoffTime).getTime()) {
      throw badRequest('Pick-up time must be after drop-off time.');
    }

    const quantities: Record<string, number> = {};
    for (const item of row.booking_items ?? []) {
      quantities[item.tier_id] = (quantities[item.tier_id] ?? 0) + Number(item.quantity ?? 0);
    }
    const tierPricing: TierPricing[] = (tiers ?? []).map((t: any) => ({
      id: t.id,
      rate_daily_usd: Number(t.rate_daily_usd),
      rate_weekly_usd: Number(t.rate_weekly_usd),
      insurance_fee_usd: Number(t.insurance_fee_usd ?? 0),
    }));

    const touchesAirport = bookingTouchesAirport(dropoffLocation, pickupLocation);
    const breakdown = calculateGrandTotal({
      tiers: tierPricing,
      quantities,
      dropoffISO: dropoffTime,
      pickupISO: pickupTime,
      dropoffSurchargeUsd: Number(dropoffLocation.dropoff_surcharge_usd ?? 0),
      pickupSurchargeUsd: Number(pickupLocation.pickup_surcharge_usd ?? 0),
      insuranceEnabled: Number(row.insurance_total_usd ?? 0) > 0,
      config: { weekThresholdDays: settings.week_threshold_days, minBookingDays: settings.min_booking_days },
    });
    if (!breakdown.duration.valid) throw badRequest('Invalid drop-off/pick-up time range.');

    // Airport locations are always card-only, whatever was on file before.
    const payment = resolvePayment(undefined, undefined, touchesAirport);

    Object.assign(bookingUpdate, {
      dropoff_location_id: dropoffLocation.id,
      pickup_location_id: pickupLocation.id,
      dropoff_time: dropoffTime,
      pickup_time: pickupTime,
      storage_start_date: dropoffTime.split('T')[0],
      storage_end_date: pickupTime.split('T')[0],
      duration_days: breakdown.duration.count,
      duration_value: breakdown.duration.count,
      item_total_usd: breakdown.itemFee,
      dropoff_surcharge_usd: breakdown.dropoffSurcharge,
      pickup_surcharge_usd: breakdown.pickupSurcharge,
      grand_total_usd: breakdown.grandTotal,
      payment_method: payment.method,
    });
  }

  if (patch.fullName !== undefined || patch.email !== undefined) {
    const { error: custErr } = await supabase
      .from('customers')
      .update({
        ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
        ...(patch.email !== undefined ? { email: patch.email || null } : {}),
      })
      .eq('id', row.customer_id);
    if (custErr) console.error('[db.updateBookingDetails] customer update failed:', custErr);
  }

  if (Object.keys(bookingUpdate).length > 0) {
    const { error: updateErr } = await supabase.from('bookings').update(bookingUpdate as never).eq('id', id);
    if (updateErr) {
      console.error('[db.updateBookingDetails] booking update failed:', updateErr);
      throw serverError('We could not save those changes. Please try again.');
    }
  }

  const updated = await getBookingById(id);
  if (!updated) throw notFound('Booking not found.');

  if (scheduleChanged) {
    balanceNowDue = updated.balanceDueUsd > 0;
    const { error: syncErr } = await supabase
      .from('bookings')
      .update({ payment_status: updated.paymentStatus } as never)
      .eq('id', id);
    if (syncErr) console.error('[db.updateBookingDetails] payment_status sync failed:', syncErr);
  }

  return { booking: updated, balanceNowDue };
}

/**
 * Staff/SuperAdmin action: mark a cash booking's outstanding balance as
 * physically collected.
 *
 * Always collects `balanceDueUsd` — the current ledger-derived amount
 * still owed, not a fixed "the whole total" — so this works identically
 * whether it's the first payment or the top-up after a stay extension.
 * Only meaningful for cash bookings; card payments settle exclusively
 * through Stripe (or the dev fallback in `updateBookingPayment`).
 */
export async function markCashCollected(id: string, staffUserId: string): Promise<BookingRecord> {
  const current = await getBookingById(id);
  if (!current) throw notFound('Booking not found.');
  if (current.paymentMethod !== 'cash') {
    throw badRequest('Only cash bookings can be marked as collected — this one is paid by card.');
  }
  if (current.balanceDueUsd <= 0) {
    throw conflict('This booking is already fully paid.');
  }

  return recordPayment({
    bookingId: id,
    amountUsd: current.balanceDueUsd,
    method: 'cash',
    collectedBy: staffUserId,
  });
}

/** Staff action: advance or cancel a booking. */
export async function updateBookingStatus(
  id: string,
  status: BookingRecord['status'],
  cancelReason?: string,
): Promise<BookingRecord> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('bookings')
    .update({
      booking_status: status,
      ...(status === 'cancelled'
        ? { cancelled_at: new Date().toISOString(), cancel_reason: cancelReason || null }
        : {}),
    })
    .eq('id', id);

  if (error) {
    console.error('[db.updateBookingStatus] failed:', error);
    throw serverError('We could not update that booking. Please try again.');
  }

  const updated = await getBookingById(id);
  if (!updated) throw notFound('Booking not found.');
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operations / admin listings
// ─────────────────────────────────────────────────────────────────────────────

export interface OpsFilters {
  /** Rolling window in hours from now. */
  windowHours: number;
  locationId?: string;
  status?: BookingRecord['status'];
  search?: string;
}

/**
 * Bookings relevant to the operations dashboard: anything whose drop-off
 * or pick-up falls inside the rolling window, plus everything currently
 * in storage regardless of date.
 */
export async function getOperationalBookings(filters: OpsFilters): Promise<BookingRecord[]> {
  const supabase = createAdminClient();

  const now = new Date();
  const horizon = new Date(now.getTime() + filters.windowHours * 3600_000);
  const startDate = new Date(now.getTime() - 24 * 3600_000).toISOString().split('T')[0];
  const endDate = horizon.toISOString().split('T')[0];

  let query = supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .neq('booking_status', 'cancelled')
    .or(
      `and(storage_start_date.gte.${startDate},storage_start_date.lte.${endDate}),` +
        `and(storage_end_date.gte.${startDate},storage_end_date.lte.${endDate}),` +
        `booking_status.eq.deposited`,
    )
    .order('storage_start_date', { ascending: true })
    .limit(500);

  if (filters.locationId) {
    query = query.or(
      `dropoff_location_id.eq.${filters.locationId},pickup_location_id.eq.${filters.locationId}`,
    );
  }
  if (filters.status) query = query.eq('booking_status', filters.status);

  const { data, error } = await query;
  if (error) {
    console.error('[db.getOperationalBookings] failed:', error);
    throw serverError('We could not load the operations board. Please try again.');
  }

  let records = (data ?? []).map(mapBooking);

  // Free-text search is applied in memory: the fields worth searching live
  // across the joined customer row, and the result set is capped at 500.
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    records = records.filter(
      (r) =>
        r.phone.toLowerCase().includes(term) ||
        r.fullName.toLowerCase().includes(term) ||
        r.id.toLowerCase().includes(term) ||
        r.passportNo.toLowerCase().includes(term),
    );
  }
  return records;
}

export interface AdminBookingFilters {
  status?: BookingRecord['status'];
  paymentStatus?: PaymentStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Paginated booking list for the admin panel. */
export async function listBookings(
  filters: AdminBookingFilters,
): Promise<{ bookings: BookingRecord[]; total: number }> {
  const supabase = createAdminClient();
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let query = supabase
    .from('bookings')
    .select(BOOKING_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) query = query.eq('booking_status', filters.status);
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);

  const { data, error, count } = await query;
  if (error) {
    console.error('[db.listBookings] failed:', error);
    throw serverError('We could not load bookings. Please try again.');
  }

  let bookings = (data ?? []).map(mapBooking);
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    bookings = bookings.filter(
      (b) =>
        b.phone.toLowerCase().includes(term) ||
        b.fullName.toLowerCase().includes(term) ||
        b.email.toLowerCase().includes(term) ||
        b.passportNo.toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term),
    );
  }

  return { bookings, total: count ?? bookings.length };
}

/**
 * Unscoped booking search for staff — any status, any date. The operations
 * board is deliberately limited to a rolling window of active work, which
 * made it impossible for staff to find a completed or historical booking by
 * name/phone/passport; this is the lookup path for that.
 */
export async function searchAllBookings(term: string, limit = 50): Promise<BookingRecord[]> {
  const supabase = createAdminClient();
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[db.searchAllBookings] failed:', error);
    throw serverError('We could not search bookings. Please try again.');
  }

  return (data ?? [])
    .map(mapBooking)
    .filter(
      (b) =>
        b.phone.toLowerCase().includes(needle) ||
        b.fullName.toLowerCase().includes(needle) ||
        b.email.toLowerCase().includes(needle) ||
        b.passportNo.toLowerCase().includes(needle) ||
        b.id.toLowerCase().includes(needle),
    )
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: payments ledger view
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentEntry {
  id: string;
  bookingId: string;
  bookingRef: string;
  customerName: string;
  amountUsd: number;
  method: 'cash' | 'stripe';
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  collectedByName: string | null;
  createdAt: string;
}

export interface PaymentFilters {
  method?: 'cash' | 'stripe';
  status?: 'pending' | 'succeeded' | 'failed' | 'refunded';
  limit?: number;
  offset?: number;
}

/** Paginated payments ledger for the admin panel's financial view. */
export async function listPayments(
  filters: PaymentFilters = {},
): Promise<{ payments: PaymentEntry[]; total: number }> {
  const supabase = createAdminClient();
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let query = supabase
    .from('payments')
    .select(
      `id, booking_id, amount_usd, method, status, created_at,
       booking:bookings!booking_id(id, customers(full_name)),
       collector:staff!collected_by(full_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.method) query = query.eq('method', filters.method);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query;
  if (error) {
    console.error('[db.listPayments] failed:', error);
    throw serverError('We could not load payments. Please try again.');
  }

  const payments: PaymentEntry[] = (data ?? []).map((p: any) => ({
    id: p.id,
    bookingId: p.booking_id,
    bookingRef: `#${String(p.booking_id).slice(-6).toUpperCase()}`,
    customerName: p.booking?.customers?.full_name ?? 'Guest',
    amountUsd: Number(p.amount_usd ?? 0),
    method: p.method,
    status: p.status,
    collectedByName: p.collector?.full_name ?? null,
    createdAt: p.created_at,
  }));

  return { payments, total: count ?? payments.length };
}

export interface PaymentTotals {
  todayUsd: number;
  weekUsd: number;
  allTimeUsd: number;
  todayByMethod: { cash: number; stripe: number };
}

/** Summary tiles for the admin Payments panel. Succeeded payments only. */
export async function getPaymentTotals(): Promise<PaymentTotals> {
  const supabase = createAdminClient();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('payments')
    .select('amount_usd, method, created_at')
    .eq('status', 'succeeded')
    .gte('created_at', startOfWeek);

  if (error) {
    console.error('[db.getPaymentTotals] week window failed:', error);
    throw serverError('We could not load payment totals. Please try again.');
  }

  const { data: allTimeRows, error: allTimeErr } = await supabase
    .from('payments')
    .select('amount_usd')
    .eq('status', 'succeeded');

  if (allTimeErr) {
    console.error('[db.getPaymentTotals] all-time failed:', allTimeErr);
    throw serverError('We could not load payment totals. Please try again.');
  }

  let todayUsd = 0;
  let weekUsd = 0;
  const todayByMethod = { cash: 0, stripe: 0 };

  for (const row of data ?? []) {
    const amount = Number(row.amount_usd ?? 0);
    weekUsd += amount;
    if (row.created_at >= startOfToday) {
      todayUsd += amount;
      if (row.method === 'cash' || row.method === 'stripe') todayByMethod[row.method] += amount;
    }
  }

  const allTimeUsd = (allTimeRows ?? []).reduce((sum, r) => sum + Number(r.amount_usd ?? 0), 0);

  return {
    todayUsd: round2(todayUsd),
    weekUsd: round2(weekUsd),
    allTimeUsd: round2(allTimeUsd),
    todayByMethod: { cash: round2(todayByMethod.cash), stripe: round2(todayByMethod.stripe) },
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export { isAirportLocation, bookingTouchesAirport };
