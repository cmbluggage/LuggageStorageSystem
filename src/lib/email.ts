import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import {
  bookingConfirmedTemplate,
  paymentReceivedTemplate,
  balanceDueTemplate,
  statusUpdateTemplate,
  bookingCancelledTemplate,
} from '@/lib/emailTemplates';
import type { BookingRecord } from '@/lib/db';

/**
 * Transactional email, real integration gated behind configuration — not a
 * simulation. Resend is tried first; if it isn't configured or the send
 * fails, a plain SMTP transport (works with any provider, including a
 * shared-hosting mailbox) is tried as backup. Every attempt is logged to
 * `email_log` so "did the customer actually get this" has an answer.
 *
 * Best-effort by design: a failed send is logged and swallowed, never
 * thrown — the booking/payment/status-change it's attached to must not
 * fail because an email didn't go out. Mirrors `writeAudit()`.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** For the delivery log, not the message itself. */
  bookingId?: string;
  template: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: 'resend' | 'smtp' | 'none';
}

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isEmailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Luggage Storage Colombo <onboarding@resend.dev>';

let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

let smtpTransport: nodemailer.Transporter | null = null;
function getSmtpTransport(): nodemailer.Transporter {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return smtpTransport;
}

async function logAttempt(input: SendEmailInput, provider: string, status: 'sent' | 'failed', error?: string) {
  if (!isServiceRoleConfigured()) return;
  try {
    const supabase = createAdminClient();
    await supabase.from('email_log').insert({
      booking_id: input.bookingId ?? null,
      to_email: input.to,
      template: input.template,
      provider,
      status,
      error: error ?? null,
    } as never);
  } catch (e) {
    console.error('[email] failed to write email_log:', e);
  }
}

/** Send one email, trying Resend then SMTP. Never throws. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!input.to) return { sent: false, provider: 'none' };

  if (isResendConfigured()) {
    try {
      const { error } = await getResend().emails.send({
        from: FROM_ADDRESS,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (!error) {
        await logAttempt(input, 'resend', 'sent');
        return { sent: true, provider: 'resend' };
      }
      console.error('[email] resend failed, trying backup:', error);
    } catch (e) {
      console.error('[email] resend threw, trying backup:', e);
    }
  }

  if (isSmtpConfigured()) {
    try {
      await getSmtpTransport().sendMail({
        from: FROM_ADDRESS,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      await logAttempt(input, 'smtp', 'sent');
      return { sent: true, provider: 'smtp' };
    } catch (e) {
      console.error('[email] smtp backup failed:', e);
      await logAttempt(input, 'smtp', 'failed', e instanceof Error ? e.message : String(e));
      return { sent: false, provider: 'smtp' };
    }
  }

  if (!isResendConfigured()) {
    // Neither provider configured — log once as failed so the gap is visible in email_log.
    await logAttempt(input, 'none', 'failed', 'No email provider configured.');
  }
  return { sent: false, provider: 'none' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle emails — one function per event, called from the route/webhook
// that owns that event. All best-effort: callers should .catch() and log,
// never let an email failure fail the request.
// ─────────────────────────────────────────────────────────────────────────────

export async function sendBookingConfirmedEmail(booking: BookingRecord): Promise<SendEmailResult> {
  if (!booking.email) return { sent: false, provider: 'none' };
  const { subject, html } = bookingConfirmedTemplate(booking);
  return sendEmail({ to: booking.email, subject, html, bookingId: booking.id, template: 'booking_confirmed' });
}

export async function sendPaymentReceivedEmail(booking: BookingRecord): Promise<SendEmailResult> {
  if (!booking.email) return { sent: false, provider: 'none' };
  const { subject, html } = paymentReceivedTemplate(booking);
  return sendEmail({ to: booking.email, subject, html, bookingId: booking.id, template: 'payment_received' });
}

export async function sendBalanceDueEmail(booking: BookingRecord, payUrl?: string): Promise<SendEmailResult> {
  if (!booking.email) return { sent: false, provider: 'none' };
  const { subject, html } = balanceDueTemplate(booking, payUrl);
  return sendEmail({ to: booking.email, subject, html, bookingId: booking.id, template: 'balance_due' });
}

export async function sendStatusUpdateEmail(booking: BookingRecord, status: string): Promise<SendEmailResult> {
  if (!booking.email) return { sent: false, provider: 'none' };
  const { subject, html } = statusUpdateTemplate(booking, status);
  return sendEmail({ to: booking.email, subject, html, bookingId: booking.id, template: `status_${status}` });
}

export async function sendBookingCancelledEmail(booking: BookingRecord, reason?: string): Promise<SendEmailResult> {
  if (!booking.email) return { sent: false, provider: 'none' };
  const { subject, html } = bookingCancelledTemplate(booking, reason);
  return sendEmail({ to: booking.email, subject, html, bookingId: booking.id, template: 'booking_cancelled' });
}
