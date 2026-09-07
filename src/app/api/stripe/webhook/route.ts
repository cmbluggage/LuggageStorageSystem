import { markStripePaymentSucceeded, markStripePaymentFailed } from '@/lib/db';
import { constructWebhookEvent, isStripeConfigured } from '@/lib/stripe';
import { sendBookingConfirmedEmail, sendPaymentReceivedEmail } from '@/lib/email';
import { badRequest, fail, ok, serverError } from '@/lib/api/http';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook — the only source of truth for "did this
 * Checkout Session actually get paid."
 *
 * Deliberately NOT behind requireStaff/requireSuperAdmin — this is called
 * by Stripe's servers, not a portal user, and is authenticated by the
 * signature check below instead. Don't "fix" this into the usual auth
 * pattern; that would just make Stripe unable to reach it.
 *
 * Reads the raw body (not parsed JSON) because Stripe's signature is
 * computed over the exact bytes sent — re-serializing a parsed body would
 * invalidate it.
 */
export async function POST(req: Request) {
  try {
    if (!isStripeConfigured()) throw serverError('Stripe is not configured.');

    const signature = req.headers.get('stripe-signature');
    if (!signature) throw badRequest('Missing Stripe signature.');

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(rawBody, signature);
    } catch (err) {
      console.error('[stripe.webhook] signature verification failed:', err);
      throw badRequest('Invalid signature.');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== 'paid') break;

        const result = await markStripePaymentSucceeded(
          session.id,
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        );
        // emailToSend is null for a replayed webhook (already-succeeded
        // session) — must never re-send a lifecycle email on a retry.
        if (result?.emailToSend === 'confirmed') {
          await sendBookingConfirmedEmail(result.booking).catch((e) =>
            console.error('[stripe.webhook] booking-confirmed email failed:', e),
          );
        } else if (result?.emailToSend === 'payment_received') {
          await sendPaymentReceivedEmail(result.booking).catch((e) =>
            console.error('[stripe.webhook] payment-received email failed:', e),
          );
        }
        break;
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await markStripePaymentFailed(session.id);
        break;
      }

      default:
        // Ignore everything else — this app only cares about Checkout Session outcomes.
        break;
    }

    return ok({ received: true });
  } catch (err) {
    return fail(err, 'stripe.webhook.POST');
  }
}
