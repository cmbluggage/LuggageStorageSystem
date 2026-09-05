import { requestOtp } from '@/lib/otp';
import { findCustomerByContact } from '@/lib/db';
import { parseBody, otpRequestSchema, emailSchema } from '@/lib/validation/schemas';
import { badRequest, clientIp, fail, ok, tooManyRequests, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/otp/request — send a 6-digit email verification code.
 *
 * 'booking_create': `contact` is the email the customer just typed into
 * the booking form — validated as an email and sent to directly, since
 * there's no existing account to resolve against yet.
 *
 * 'booking_lookup': `contact` is a phone number OR email typed on
 * /my-bookings. Resolved server-side to the matching customer's on-file
 * email — the code is never sent to the raw typed value, so this
 * endpoint can't be used to relay mail to an address the requester
 * doesn't already own on the account.
 *
 * The response is intentionally identical whether or not a match was
 * found (or the request was rate-limited) — anything else would let an
 * attacker enumerate which phone numbers/emails have accounts.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`otp:request:ip:${ip}`, 30, 600_000).allowed) {
      throw tooManyRequests('Too many requests. Please wait a few minutes and try again.');
    }

    const input = await parseBody(req, otpRequestSchema);
    const GENERIC_MESSAGE = 'If that matches an account, we\'ve emailed a 6-digit verification code.';

    if (input.purpose === 'booking_create') {
      const parsed = emailSchema.safeParse(input.contact);
      if (!parsed.success) throw badRequest('Enter a valid email address.');

      const { requestId } = await requestOtp({ email: parsed.data, purpose: 'booking_create', ip });
      return ok({ requestId, message: 'We\'ve emailed a 6-digit verification code.' }, NO_STORE);
    }

    // booking_lookup — resolve, but never reveal whether resolution succeeded.
    const customer = await findCustomerByContact(input.contact);
    const { requestId } = await requestOtp({
      email: customer?.email ?? `no-match+${Date.now()}@invalid.local`,
      purpose: 'booking_lookup',
      customerId: customer?.id,
      ip,
    });

    return ok({ requestId, message: GENERIC_MESSAGE }, NO_STORE);
  } catch (err) {
    return fail(err, 'otp.request.POST');
  }
}
