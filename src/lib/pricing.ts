/**
 * STOWAWAY — Shared Pricing Engine
 *
 * Single source of truth for all duration & pricing calculations.
 * Imported by both client components and server API routes to avoid drift.
 *
 * Everything tunable is passed in via `PricingConfig` rather than hardcoded,
 * so the admin panel can retune the business without a redeploy. Callers on
 * the server get the config from `getSettings()`; the client receives it
 * from `/api/settings`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface PricingConfig {
  /** Bookings longer than this use each tier's long-stay rate for ALL days. */
  weekThresholdDays: number;
  /** Floor applied to every booking duration. */
  minBookingDays: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  weekThresholdDays: 7,
  minBookingDays: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Duration
// ─────────────────────────────────────────────────────────────────────────────

export type BillableUnit = 'hours' | 'days';

export interface DurationResult {
  billableUnit: BillableUnit;
  count: number;    // days
  label: string;    // "2 days"
  /** Exact elapsed hours, before rounding — useful for display and limits. */
  exactHours: number;
  /** False when the inputs were missing or the range was inverted. */
  valid: boolean;
}

const EMPTY_DURATION: DurationResult = {
  billableUnit: 'days',
  count: 0,
  label: '',
  exactHours: 0,
  valid: false,
};

/**
 * Calculate billing duration from ISO datetime strings.
 *
 * Billing is by whole 24-hour cycles from the drop-off instant:
 *   0–24h   → 1 day   (10:00 Mon → 14:00 Mon, and 22:00 Mon → 08:00 Tue)
 *   24–48h  → 2 days  (10:00 Mon → 11:00 Tue)
 *   48–72h  → 3 days, and so on.
 *
 * Note this is elapsed-time based, not calendar based: crossing midnight
 * does not by itself add a day.
 */
export function calculateDuration(
  dropoffISO: string,
  pickupISO: string,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): DurationResult {
  if (!dropoffISO || !pickupISO) return EMPTY_DURATION;

  const t1 = new Date(dropoffISO).getTime();
  const t2 = new Date(pickupISO).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2) || t2 < t1) return EMPTY_DURATION;

  const exactHours = (t2 - t1) / (1000 * 60 * 60);
  const floor = Math.max(1, Math.floor(config.minBookingDays) || 1);
  const days = Math.max(floor, Math.ceil(exactHours / 24));

  return {
    billableUnit: 'days',
    count: days,
    label: days === 1 ? '1 day' : `${days} days`,
    exactHours,
    valid: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared tier interface (subset of full ItemTier — safe to import anywhere)
// ─────────────────────────────────────────────────────────────────────────────

export interface TierPricing {
  id: string;
  /** Standard per-day rate, used for bookings at or under the threshold. */
  rate_daily_usd: number;
  /**
   * Reduced per-day rate applied to ALL days once the booking exceeds
   * `weekThresholdDays`. (Stored in the rate_weekly_usd column; the admin
   * UI labels it "Day Rate (After 7 Days)".)
   */
  rate_weekly_usd: number;
  /** Flat fee per item per booking when the customer opts into insurance. */
  insurance_fee_usd: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective rate helper
// ─────────────────────────────────────────────────────────────────────────────

export function effectiveDailyRate(
  tier: TierPricing,
  days: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): number {
  const rate = days > config.weekThresholdDays ? tier.rate_weekly_usd : tier.rate_daily_usd;
  // A tier with a missing/zero long-stay rate must not make storage free.
  return Number.isFinite(rate) && rate > 0 ? rate : tier.rate_daily_usd;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round to cents. Float accumulation across line items otherwise yields
 * totals like 33.000000000000004, which then differ between the client
 * estimate and the server's authoritative recalculation.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item fee
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItem {
  tierId: string;
  qty: number;
  /** Per-day rate actually applied, after the long-stay rule. */
  unitRateUsd: number;
  days: number;
  lineTotalUsd: number;
}

/**
 * Per-tier breakdown of the storage fee. The server persists these as
 * booking_items rows so the price a customer agreed to is preserved even
 * if an admin later edits the tier.
 */
export function calculateLineItems(
  tiers: TierPricing[],
  quantities: Record<string, number>,
  duration: DurationResult,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): LineItem[] {
  const tierMap = new Map(tiers.map((t) => [t.id, t]));
  const days = Math.max(1, duration.count || 1);

  const lines: LineItem[] = [];
  for (const [tierId, qty] of Object.entries(quantities)) {
    if (!qty || qty <= 0) continue;
    const tier = tierMap.get(tierId);
    if (!tier) continue;

    const unitRateUsd = effectiveDailyRate(tier, days, config);
    lines.push({
      tierId,
      qty,
      unitRateUsd,
      days,
      lineTotalUsd: round2(unitRateUsd * qty * days),
    });
  }
  return lines;
}

export function calculateItemFee(
  tiers: TierPricing[],
  quantities: Record<string, number>,
  duration: DurationResult,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): number {
  return round2(
    calculateLineItems(tiers, quantities, duration, config).reduce((s, l) => s + l.lineTotalUsd, 0),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insurance fee
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flat fee per unit, charged once per booking regardless of duration.
 * Returns 0 when the customer opted out or the operator disabled insurance.
 */
export function calculateInsuranceFee(
  tiers: TierPricing[],
  quantities: Record<string, number>,
  insuranceEnabled: boolean,
): number {
  if (!insuranceEnabled) return 0;
  const tierMap = new Map(tiers.map((t) => [t.id, t]));

  return round2(
    Object.entries(quantities).reduce((sum, [tierId, qty]) => {
      if (!qty || qty <= 0) return sum;
      const tier = tierMap.get(tierId);
      return sum + (tier?.insurance_fee_usd ?? 0) * qty;
    }, 0),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grand total breakdown
// ─────────────────────────────────────────────────────────────────────────────

export interface PricingBreakdown {
  duration: DurationResult;
  lineItems: LineItem[];
  itemFee: number;
  dropoffSurcharge: number;
  pickupSurcharge: number;
  insuranceFee: number;
  grandTotal: number;
}

export interface GrandTotalParams {
  tiers: TierPricing[];
  quantities: Record<string, number>;
  dropoffISO: string;
  pickupISO: string;
  /**
   * The airport handling cost, if any, belongs entirely to the location's
   * own surcharge fields — there is deliberately no separate global
   * "airport fee" stacked on top. An airport location that should cost
   * more simply has a higher dropoff/pickup surcharge; adding a second fee
   * here double-charged every airport booking (caught and removed).
   */
  dropoffSurchargeUsd: number;
  pickupSurchargeUsd: number;
  insuranceEnabled: boolean;
  config?: PricingConfig;
}

export function calculateGrandTotal(params: GrandTotalParams): PricingBreakdown {
  const config = params.config ?? DEFAULT_PRICING_CONFIG;

  const duration = calculateDuration(params.dropoffISO, params.pickupISO, config);
  const lineItems = calculateLineItems(params.tiers, params.quantities, duration, config);
  const itemFee = round2(lineItems.reduce((s, l) => s + l.lineTotalUsd, 0));
  const insuranceFee = calculateInsuranceFee(params.tiers, params.quantities, params.insuranceEnabled);

  const dropoffSurcharge = round2(params.dropoffSurchargeUsd || 0);
  const pickupSurcharge = round2(params.pickupSurchargeUsd || 0);

  return {
    duration,
    lineItems,
    itemFee,
    dropoffSurcharge,
    pickupSurcharge,
    insuranceFee,
    grandTotal: round2(itemFee + dropoffSurcharge + pickupSurcharge + insuranceFee),
  };
}
