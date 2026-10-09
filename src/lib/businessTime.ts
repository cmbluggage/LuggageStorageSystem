/**
 * Booking times are stored as naive wall-clock strings ("2026-10-09T10:00")
 * meaning Sri Lanka time — the time slots are the business's opening hours
 * in Colombo. `new Date(naive)` would instead read them in whatever timezone
 * the code happens to run in: UTC on Vercel, the customer's own zone in the
 * browser (an overseas customer saw a Colombo 10:00 slot rejected as "in the
 * past" because it was 10:26 on their phone in Australia). Always parse
 * booking times through `parseBookingTime` instead.
 *
 * Sri Lanka has no daylight saving, so a fixed offset is exact.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Colombo';
const BUSINESS_UTC_OFFSET = '+05:30';

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Parses a booking time string as Colombo wall-clock time (strings with an explicit zone are respected as-is). */
export function parseBookingTime(value: string): Date {
  const v = value.trim();
  if (HAS_ZONE.test(v) || !v.includes('T')) return new Date(v);
  const withSeconds = /T\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
  return new Date(`${withSeconds}${BUSINESS_UTC_OFFSET}`);
}

/** Today's date in Colombo as YYYY-MM-DD, regardless of the viewer's own timezone. */
export function businessToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIME_ZONE });
}
