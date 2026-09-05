import { getBookingById, createPendingStripePayment } from '@/lib/db';
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe';
import { idSchema } from '@/lib/validation/schemas';
import { badRequest, clientIp, conflict, fail, notFound, ok, serverError, tooManyRequests, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';
import { bookingRef } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/[id]/checkout — start a real Stripe payment for
 * whatever this booking currently owes.
 *
 * There is no separate "pay the extension" endpoint — this always charges
 * `balanceDueUsd`, the ledger-derived amount still owed, so the exact same
 * call works for the original payment, a post-extension top-up, or a
 * partial-payment catch-up. Used by the customer checkout page and by
 * staff generating a pay-at-counter link/QR for a walk-in balance.
 *
 * Public like the other /api/bookings/[id] routes — the booking id is the
 * unguessable-UUID capability (see that route's doc comment) — but rate
 * limited per IP since it calls out to Stripe.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const ip = clientIp(req);
    if (!rateLimit(`checkout:${ip}`, 20, 600_000).allowed) {
      throw tooManyRequests('Too many payment attempts. Please wait a moment.');
    }

    if (!isStripeConfigured()) {
      throw serverError('Card payments are not yet available. Please choose cash, or try again shortly.');
    }

    const booking = await getBookingById(id);
    if (!booking) throw notFound('We could not find that booking.');
    if (booking.balanceDueUsd <= 0) throw conflict('This booking is already fully paid.');

    const origin = new URL(req.url).origin;
    const description =
      booking.amountPaidUsd > 0
        ? `Luggage Storage Colombo — balance due for booking ${bookingRef(id)}`
        : `Luggage Storage Colombo — booking ${bookingRef(id)}`;

    const session = await createCheckoutSession({
      bookingId: id,
      amountUsd: booking.balanceDueUsd,
      description,
      customerEmail: booking.email || undefined,
      successUrl: `${origin}/booking/${id}/confirmation?pm=stripe&paid=1`,
      cancelUrl: `${origin}/checkout/${id}`,
    });

    if (!session.url) throw serverError('We could not start that payment. Please try again.');

    await createPendingStripePayment(id, booking.balanceDueUsd, session.id);

    return ok({ url: session.url, amountUsd: booking.balanceDueUsd }, NO_STORE);
  } catch (err) {
    return fail(err, 'bookings.[id].checkout.POST');
  }
}
