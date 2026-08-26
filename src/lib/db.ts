import { createAdminClient } from '@/lib/supabase/admin';
import { badRequest, conflict, notFound, serverError } from '@/lib/api/http';
import { bookingTouchesAirport, isAirportLocation, resolvePayment, toApiMethod } from '@/lib/locations';
import type { PaymentMethodApi, PaymentStatus } from '@/lib/locations';
import { calculateGrandTotal, round2, type LineItem, type TierPricing } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';
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
  airportServiceUsd: number;
  grandTotalUsd: number;
  paymentMethod: PaymentMethodApi;
  paymentStatus: PaymentStatus;
  status: 'confirmed' | 'in_transit' | 'deposited' | 'picked_up' | 'cancelled';
  qrCodeToken: string;
  allowsCash: boolean;
  isAirportBooking: boolean;
  createdAt: string;
}

/** Everything the booking route has already validated and priced. */
export interface SaveBookingInput {
  phone: string;
  fullName: string;
  email?: string;
  passportNo: string;
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
  airportServiceUsd: number;
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
  pickup_loc:locations!pickup_location_id(id, code, name, is_airport, allows_cash, requires_stripe)
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embedded
   selects are not expressible in the hand-maintained Database type; the
   shape is normalised immediately below in mapBooking. */

function mapBooking(b: any): BookingRecord {
  const dropoffLoc = b.dropoff_loc ?? null;
  const pickupLoc = b.pickup_loc ?? null;
  const isAirport = bookingTouchesAirport(dropoffLoc, pickupLoc);

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
    airportServiceUsd: Number(b.airport_service_usd ?? 0),
    grandTotalUsd: Number(b.grand_total_usd ?? 0),
    // An airport booking is card-only no matter what the column says.
    paymentMethod: isAirport ? 'stripe' : toApiMethod(b.payment_method),
    paymentStatus: (b.payment_status as PaymentStatus) ?? 'pending',
    status: b.booking_status ?? 'confirmed',
    qrCodeToken: b.qr_code_token ?? '',
    allowsCash: !isAirport,
    isAirportBooking: isAirport,
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
      airport_service_usd: input.airportServiceUsd,
      insurance_total_usd: input.insuranceTotalUsd,
      insurance_enabled: input.insuranceEnabled,
      grand_total_usd: input.grandTotalUsd,
      payment_method: payment.method,
      payment_status: payment.status,
      booking_status: 'confirmed',
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
// Update
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the payment method/status on an existing booking.
 *
 * The airport lockout is re-derived from the booking's own location rows,
 * never from the caller's payload — a client asking to pay cash for an
 * airport booking is silently corrected to card, not trusted.
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
      `id, payment_status,
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

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ payment_method: payment.method, payment_status: payment.status })
    .eq('id', id);

  if (updateErr) {
    console.error('[db.updateBookingPayment] update failed:', updateErr);
    throw serverError('We could not record your payment. Please try again.');
  }

  const updated = await getBookingById(id);
  if (!updated) throw notFound('Booking not found.');
  return updated;
}

/**
 * Staff/SuperAdmin action: edit a booking's customer details, notes, or
 * schedule (location + time).
 *
 * There is no live payment gateway here — payment_method is just a
 * cash/card flag and staff always collect money in person. So an edit is
 * never blocked by payment_status. Instead, if a location/time change
 * recalculates a HIGHER grand total than what is on file, payment_status
 * is reset to 'pending' so staff see a balance is owed; an equal or lower
 * total leaves 'paid' alone. This intentionally has no partial-payment
 * ledger — "pending" on an edited booking means "collect the recalculated
 * total," matching how the business actually operates.
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
      airportServiceFeeUsd: touchesAirport ? settings.airport_service_fee_usd : 0,
      insuranceEnabled: Number(row.insurance_total_usd ?? 0) > 0,
      config: { weekThresholdDays: settings.week_threshold_days, minBookingDays: settings.min_booking_days },
    });
    if (!breakdown.duration.valid) throw badRequest('Invalid drop-off/pick-up time range.');

    // Airport bookings are always card + settled immediately (the "simulated
    // gateway settles instantly" rule from resolvePayment/saveBooking) — that
    // invariant holds regardless of the balance-due logic below, exactly
    // like booking creation and updateBookingPayment.
    const payment = resolvePayment(undefined, undefined, touchesAirport);
    const previousTotal = round2(Number(row.grand_total_usd ?? 0));
    balanceNowDue = !touchesAirport && breakdown.grandTotal > previousTotal;

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
      airport_service_usd: breakdown.airportServiceFee,
      grand_total_usd: breakdown.grandTotal,
      payment_method: payment.method,
      ...(touchesAirport ? { payment_status: 'paid' } : balanceNowDue ? { payment_status: 'pending' } : {}),
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
  return { booking: updated, balanceNowDue };
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

/* eslint-enable @typescript-eslint/no-explicit-any */

export { isAirportLocation, bookingTouchesAirport };
