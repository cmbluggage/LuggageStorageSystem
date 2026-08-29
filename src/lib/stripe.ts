import Stripe from 'stripe';

/**
 * Real Stripe integration, gated behind whether a live secret key is
 * configured — not a simulation. Until `STRIPE_SECRET_KEY` is set (e.g.
 * before launch, or in local dev), card payments fall back to the
 * instant-settle path in `db.ts` (`updateBookingPayment`); the moment the
 * key is added, every card payment goes through this module and nothing
 * else needs to change.
 *
 * Checkout Session over Payment Intents/Elements: this app has no PCI
 * surface of its own and no live customer accounts, so a hosted redirect
 * page is the right shape — customers are never asked to enter card
 * details on this domain.
 */

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

export interface CreateCheckoutSessionInput {
  bookingId: string;
  amountUsd: number;
  description: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * One Checkout Session, always for "the current balance due" — there is no
 * separate concept of "initial payment" vs. "extension payment" on the
 * Stripe side. The caller (a booking route or the staff pay-at-counter
 * action) decides the amount from the ledger; this just charges it.
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: input.description },
          // Stripe wants the smallest currency unit; round to cents first
          // so floating-point drift never produces an off-by-one charge.
          unit_amount: Math.round(input.amountUsd * 100),
        },
        quantity: 1,
      },
    ],
    customer_email: input.customerEmail || undefined,
    client_reference_id: input.bookingId,
    metadata: { bookingId: input.bookingId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return session;
}

/** Verify and parse a webhook payload. Throws if the signature is invalid. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
