import { randomInt, createHmac } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverError } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';
import { sendEmail } from '@/lib/email';
import { otpCodeTemplate } from '@/lib/emailTemplates';

/**
 * Email OTP verification, shared by two gates:
 *  - 'booking_create': prove the customer owns the email before a booking
 *    is created against it.
 *  - 'booking_lookup': prove the requester owns the on-file email before
 *    /my-bookings returns anything (replaces the old phone-only lookup,
 *    which treated a knowable phone number as the whole credential).
 *
 * Security properties, deliberately:
 *  - The code is never stored in plaintext — only an HMAC-SHA256 keyed
 *    with OTP_HMAC_SECRET, so a DB leak alone can't produce a usable code.
 *  - Generated with crypto.randomInt (CSPRNG), never Math.random.
 *  - 10 minute expiry, 5 wrong attempts invalidates the code, 60s cooldown
 *    between sends to the same email+purpose — standard ranges industry-wide.
 *  - Single-use: `used_at` is set the moment a verified row is actually
 *    spent, so a verified code can't be replayed.
 *  - No enumeration: callers of `requestOtp` must resolve the target email
 *    themselves (this module never trusts a caller-supplied "send to"
 *    address for 'booking_lookup') and must return an identical response
 *    whether or not a match was found.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** How long a verified-but-unused row stays spendable. */
const CONSUME_WINDOW_MS = 20 * 60 * 1000;

export type OtpPurpose = 'booking_create' | 'booking_lookup';

function getSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret) throw serverError('Email verification is not configured.');
  return secret;
}

function hashCode(code: string): string {
  return createHmac('sha256', getSecret()).update(code).digest('hex');
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface RequestOtpInput {
  /** The exact address the code is sent to — resolved by the caller. */
  email: string;
  purpose: OtpPurpose;
  customerId?: string;
  ip: string;
}

export interface RequestOtpResult {
  /** Opaque id the client echoes back to /verify. Never reveals whether a match existed. */
  requestId: string;
  /** Only true when a real send was attempted — callers must not use this to shape a differential response to the client. */
  sent: boolean;
}

/**
 * Send a code to `input.email`. Always returns a requestId, even under
 * rate limiting, so the HTTP layer can respond identically regardless of
 * whether a real send happened — callers must not branch client-visible
 * behavior on `sent`.
 */
export async function requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
  const email = input.email.trim().toLowerCase();
  const supabase = createAdminClient();

  const perEmail = rateLimit(`otp:send:email:${input.purpose}:${email}`, MAX_SENDS_PER_WINDOW, SEND_WINDOW_MS);
  const perIp = rateLimit(`otp:send:ip:${input.ip}`, 20, SEND_WINDOW_MS);
  const cooldownKey = `otp:cooldown:${input.purpose}:${email}`;
  const cooldown = rateLimit(cooldownKey, 1, RESEND_COOLDOWN_MS);

  if (!perEmail.allowed || !perIp.allowed || !cooldown.allowed) {
    // Fabricate a requestId that simply won't verify — the caller must
    // not learn from this whether the target email exists.
    return { requestId: `blocked-${randomInt(1e15).toString(36)}`, sent: false };
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  // Invalidate any still-live code for this email+purpose so only one is
  // ever guessable at a time.
  await supabase
    .from('otp_verifications')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('email', email)
    .eq('purpose', input.purpose)
    .is('used_at', null);

  const { data, error } = await supabase
    .from('otp_verifications')
    .insert({
      email,
      purpose: input.purpose,
      code_hash: codeHash,
      expires_at: expiresAt,
      max_attempts: MAX_ATTEMPTS,
      customer_id: input.customerId ?? null,
      request_ip: input.ip,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error('[otp.requestOtp] insert failed:', error);
    throw serverError('We could not send a verification code. Please try again.');
  }

  // Sentinel address for a "no matching account" resolution (booking_lookup)
  // — a real row is still created (so response shape/latency match a real
  // send), but nothing is actually dispatched to it, to avoid generating
  // bounces against a fabricated address.
  const isSentinel = email.endsWith('@invalid.local');
  if (!isSentinel) {
    const { subject, html } = otpCodeTemplate(code, input.purpose);
    await sendEmail({ to: email, subject, html, template: `otp_${input.purpose}` }).catch((e) =>
      console.error('[otp.requestOtp] send failed:', e),
    );
  }

  return { requestId: data.id as string, sent: !isSentinel };
}

export interface VerifyOtpResult {
  verified: boolean;
  message: string;
}

/** Check a submitted code against the requestId. Increments attempts on every call. */
export async function verifyOtp(requestId: string, code: string, purpose: OtpPurpose): Promise<VerifyOtpResult> {
  const supabase = createAdminClient();

  if (requestId.startsWith('blocked-')) {
    return { verified: false, message: 'Incorrect or expired code.' };
  }

  const { data: row, error } = await supabase
    .from('otp_verifications')
    .select('id, code_hash, expires_at, attempts, max_attempts, verified_at, used_at, purpose')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !row) return { verified: false, message: 'Incorrect or expired code.' };
  if (row.purpose !== purpose) return { verified: false, message: 'Incorrect or expired code.' };
  if (row.used_at) return { verified: false, message: 'This code has already been used. Please request a new one.' };
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { verified: false, message: 'That code has expired. Please request a new one.' };
  }
  if ((row.attempts as number) >= (row.max_attempts as number)) {
    return { verified: false, message: 'Too many incorrect attempts. Please request a new code.' };
  }

  const matches = hashCode(code.trim()) === row.code_hash;

  await supabase
    .from('otp_verifications')
    .update({
      attempts: (row.attempts as number) + 1,
      ...(matches ? { verified_at: new Date().toISOString() } : {}),
    })
    .eq('id', requestId);

  if (!matches) return { verified: false, message: 'Incorrect code. Please try again.' };
  return { verified: true, message: 'Verified.' };
}

/**
 * Atomically spend a verified row for its purpose. Returns the row (with
 * `email`/`customer_id`) on success, or null if it isn't a spendable
 * verified row for this purpose+email. Callers must treat null as "please
 * verify your email again" — never partially proceed.
 */
export async function consumeOtp(
  requestId: string,
  purpose: OtpPurpose,
  expectedEmail: string,
): Promise<{ email: string; customerId: string | null } | null> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - CONSUME_WINDOW_MS).toISOString();

  const { data: row, error } = await supabase
    .from('otp_verifications')
    .select('id, email, customer_id, purpose, verified_at, used_at')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !row) return null;
  if (row.purpose !== purpose) return null;
  if (row.used_at) return null;
  if (!row.verified_at) return null;
  if ((row.verified_at as string) < cutoff) return null;
  if ((row.email as string).toLowerCase() !== expectedEmail.trim().toLowerCase()) return null;

  // Mark used only if it's still unused — closes the race between two
  // concurrent requests spending the same verification.
  const { data: updated, error: updateErr } = await supabase
    .from('otp_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('id', requestId)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) return null;

  return { email: row.email as string, customerId: (row.customer_id as string | null) ?? null };
}
