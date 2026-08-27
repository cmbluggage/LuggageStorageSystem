/**
 * Short, human-sayable reference for a booking — what staff read out over
 * the phone or WhatsApp. The full UUID is never something a customer or
 * staff member should need to read aloud; the trailing 6 characters are
 * enough to disambiguate against the booking list a phone/name search
 * returns, and the full id stays available in a title attribute for
 * anyone who does need to copy it.
 */
export function bookingRef(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}
