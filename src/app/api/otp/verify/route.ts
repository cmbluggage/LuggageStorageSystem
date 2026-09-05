import { verifyOtp } from '@/lib/otp';
import { parseBody, otpVerifySchema } from '@/lib/validation/schemas';
import { clientIp, fail, ok, tooManyRequests, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/otp/verify — check a submitted 6-digit code.
 *
 * On success this only flips `verified_at` on the otp_verifications row —
 * it does NOT create the booking or return booking data. The caller
 * (POST /api/bookings for 'booking_create', GET /api/my-bookings for
 * 'booking_lookup') is what actually spends the verification via
 * consumeOtp(), which re-checks everything and is single-use.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`otp:verify:ip:${ip}`, 30, 600_000).allowed) {
      throw tooManyRequests('Too many attempts. Please wait a few minutes and try again.');
    }

    const input = await parseBody(req, otpVerifySchema);
    const result = await verifyOtp(input.requestId, input.code, input.purpose);

    return ok({ verified: result.verified, message: result.message, requestId: input.requestId }, NO_STORE);
  } catch (err) {
    return fail(err, 'otp.verify.POST');
  }
}
