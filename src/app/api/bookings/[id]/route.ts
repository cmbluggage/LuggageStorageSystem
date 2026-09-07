import { getBookingById, updateBookingPayment } from '@/lib/db';
import { parseBody, updatePaymentSchema, idSchema } from '@/lib/validation/schemas';
import { badRequest, clientIp, fail, notFound, ok, tooManyRequests, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';
import { sendBookingConfirmedEmail, sendPaymentReceivedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings/[id]
 *
 * The booking id is an unguessable UUID and acts as the capability to view
 * it — the customer reaches this from their own confirmation link. The
 * passport number is stripped: it is never needed to render a booking.
 * The collecting staff member's name is stripped too — internal identity,
 * not something a customer needs.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const booking = await getBookingById(id);
    if (!booking) throw notFound('We could not find that booking.');

    const { passportNo, cashCollectedByName, ...safe } = booking;
    void passportNo;
    void cashCollectedByName;
    return ok({ booking: safe }, NO_STORE);
  } catch (err) {
    return fail(err, 'bookings.[id].GET');
  }
}

/**
 * PATCH /api/bookings/[id] — record payment.
 *
 * The airport lockout and the already-paid check both live in
 * updateBookingPayment, derived from the booking's own location rows.
 * A client asking to pay cash for an airport booking is corrected to card,
 * never trusted.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const ip = clientIp(req);
    if (!rateLimit(`pay:${ip}`, 30, 600_000).allowed) {
      throw tooManyRequests('Too many payment attempts. Please wait a moment.');
    }

    const { paymentMethod, paymentStatus } = await parseBody(req, updatePaymentSchema);
    const { booking, emailToSend } = await updateBookingPayment(id, paymentMethod, paymentStatus);

    // Best-effort — a failed send must never fail the payment itself.
    if (emailToSend === 'confirmed') {
      sendBookingConfirmedEmail(booking).catch((e) => console.error('[bookings.[id].PATCH] booking-confirmed email failed:', e));
    } else if (emailToSend === 'payment_received') {
      sendPaymentReceivedEmail(booking).catch((e) => console.error('[bookings.[id].PATCH] payment-received email failed:', e));
    }

    const { passportNo, cashCollectedByName, ...safe } = booking;
    void passportNo;
    void cashCollectedByName;
    return ok({ booking: safe }, NO_STORE);
  } catch (err) {
    return fail(err, 'bookings.[id].PATCH');
  }
}
