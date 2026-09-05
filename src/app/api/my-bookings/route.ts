import { getBookingsByCustomerId } from '@/lib/db';
import { consumeOtp } from '@/lib/otp';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseQuery, myBookingsQuerySchema } from '@/lib/validation/schemas';
import { badRequest, clientIp, fail, ok, tooManyRequests, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/my-bookings?verificationId=... — replaces the old
 * GET /api/bookings?phone=..., which treated a phone number (knowable by
 * someone other than the customer) as the whole credential.
 *
 * Requires a `verificationId` from a completed POST /api/otp/verify call
 * with purpose 'booking_lookup'. consumeOtp() re-validates everything
 * (verified, unused, within the consume window) and marks it used —
 * single-use, so refreshing this page requires a fresh code.
 */
export async function GET(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`my-bookings:ip:${ip}`, 20, 600_000).allowed) {
      throw tooManyRequests('Too many requests. Please wait a few minutes and try again.');
    }

    const { verificationId } = parseQuery(req.url, myBookingsQuerySchema);

    // Re-read the row directly to get its email/customer_id without
    // requiring the client to know or resend the (never-shown) resolved
    // email — consumeOtp still re-checks verified/used/window itself.
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from('otp_verifications')
      .select('email')
      .eq('id', verificationId)
      .maybeSingle();

    if (!row?.email) throw badRequest('Please verify your email again.');

    const consumed = await consumeOtp(verificationId, 'booking_lookup', row.email as string);
    if (!consumed || !consumed.customerId) throw badRequest('Please verify your email again.');

    const records = await getBookingsByCustomerId(consumed.customerId);

    // Strip the identity document and internal staff identity — neither
    // is ever needed to display a booking to its customer.
    const safe = records.map(({ passportNo, cashCollectedByName, ...rest }) => {
      void passportNo;
      void cashCollectedByName;
      return rest;
    });

    return ok({ bookings: safe }, NO_STORE);
  } catch (err) {
    return fail(err, 'my-bookings.GET');
  }
}
