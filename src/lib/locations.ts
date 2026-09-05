/**
 * Airport-location rules — the single source of truth.
 *
 * This logic previously existed in several slightly different copies
 * across db.ts, each testing a different mix of flags and string
 * matches. Since it gates a payment rule, divergence between copies was a
 * live risk. Everything now funnels through `isAirportLocation`.
 */

export interface LocationFlags {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  is_airport?: boolean | null;
  requires_stripe?: boolean | null;
  allows_cash?: boolean | null;
}

/**
 * A location counts as an airport when any of these hold:
 *  - `is_airport` is set (the canonical flag),
 *  - `requires_stripe` is set (operator forced card-only),
 *  - `allows_cash` is explicitly false,
 *  - it is the seeded CMB hub (`LOC_001`).
 *
 * Name/code substring matching is deliberately NOT used. It produced
 * false positives (any location named "…Airport Road…") and false
 * negatives, and the DB flags are authoritative.
 */
export function isAirportLocation(loc: LocationFlags | null | undefined): boolean {
  if (!loc) return false;
  return Boolean(
    loc.is_airport ||
      loc.requires_stripe ||
      loc.allows_cash === false ||
      loc.code === 'LOC_001',
  );
}

/** True when either leg of the booking touches an airport location. */
export function bookingTouchesAirport(
  dropoff: LocationFlags | null | undefined,
  pickup: LocationFlags | null | undefined,
): boolean {
  return isAirportLocation(dropoff) || isAirportLocation(pickup);
}

/**
 * Whether cash is a permitted payment method for this pair of locations.
 * Airport bookings are card-only; the cash option is hidden entirely
 * rather than shown-and-disabled.
 */
export function cashAllowed(
  dropoff: LocationFlags | null | undefined,
  pickup: LocationFlags | null | undefined,
): boolean {
  return !bookingTouchesAirport(dropoff, pickup);
}

export type PaymentMethodDb = 'cash' | 'stripe_simulated';
export type PaymentMethodApi = 'cash' | 'stripe';
export type PaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'failed';

/**
 * Resolve the payment method/status the server will actually store,
 * ignoring whatever the client asked for when an airport is involved.
 */
export function resolvePayment(
  requestedMethod: PaymentMethodApi | undefined,
  requestedStatus: PaymentStatus | undefined,
  touchesAirport: boolean,
): { method: PaymentMethodDb; status: PaymentStatus } {
  if (touchesAirport) {
    // Card-only, and the simulated gateway settles immediately.
    return { method: 'stripe_simulated', status: 'paid' };
  }
  if (requestedMethod === 'stripe') {
    return { method: 'stripe_simulated', status: 'paid' };
  }
  return { method: 'cash', status: requestedStatus === 'paid' ? 'paid' : 'pending' };
}

export const toApiMethod = (m: PaymentMethodDb | string | null | undefined): PaymentMethodApi =>
  m === 'stripe_simulated' ? 'stripe' : 'cash';
