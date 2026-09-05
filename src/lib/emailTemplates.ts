import { bookingRef } from '@/lib/format';
import { formatUSD } from '@/lib/currency';
import { SITE_URL } from '@/lib/site';
import type { BookingRecord } from '@/lib/db';

/**
 * Plain, inline-styled HTML — email clients don't run a CSS engine, so no
 * Tailwind classes here. Kept deliberately simple: a link back to the
 * confirmation page (which renders the live QR and current status) rather
 * than trying to embed a QR image in the email itself.
 */

/**
 * A div-based glyph mark (orange square + three inline-block bars) was
 * tried here and dropped — it didn't render reliably across real inbox
 * clients (unlike the browser-only preview it looked fine in). Plain
 * text wordmark instead: zero rendering risk, still on-brand.
 */
function shell(bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px 20px; color: #1C130E; text-align:center;">
      <div style="margin-bottom: 24px;">
        <span style="font-weight:800; font-size:17px; color:#e8620a; letter-spacing:-0.2px;">Luggage Storage Colombo</span>
      </div>
      ${bodyHtml}
      <p style="margin-top:32px; font-size:11px; color:#8a8a8a; line-height:1.6;">
        You're receiving this email because this address was used for a booking or verification request at
        Luggage Storage Colombo (Colombo Airport). If that wasn't you, no action is needed — you can safely ignore this message.
      </p>
    </div>
  `.trim();
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block; background:#e8620a; color:#fff; font-weight:700; font-size:14px; padding:12px 24px; border-radius:100px; text-decoration:none; margin-top:16px;">${label}</a>`;
}

function confirmationUrl(bookingId: string): string {
  return `${SITE_URL}/booking/${bookingId}/confirmation`;
}

export function bookingConfirmedTemplate(b: BookingRecord) {
  return {
    subject: `Booking confirmed — ${bookingRef(b.id)}`,
    html: shell(`
      <h1 style="font-size:20px; margin:0 0 12px;">Your storage is booked, ${b.fullName.split(' ')[0] || 'there'}.</h1>
      <p style="font-size:14px; line-height:1.6; color:#4a4a4a;">
        Reference <strong>${bookingRef(b.id)}</strong> — drop off at <strong>${b.dropoffLocationName}</strong>,
        pick up at <strong>${b.pickupLocationName}</strong>. Total: <strong>${formatUSD(b.grandTotalUsd)}</strong>
        (${b.balanceDueUsd > 0 ? `${formatUSD(b.balanceDueUsd)} due` : 'paid'}).
      </p>
      <div>${button('View your QR pass', confirmationUrl(b.id))}</div>
    `),
  };
}

export function paymentReceivedTemplate(b: BookingRecord) {
  return {
    subject: `Payment received — ${bookingRef(b.id)}`,
    html: shell(`
      <h1 style="font-size:20px; margin:0 0 12px;">Payment received, thank you.</h1>
      <p style="font-size:14px; line-height:1.6; color:#4a4a4a;">
        Booking <strong>${bookingRef(b.id)}</strong> is now
        ${b.balanceDueUsd > 0 ? `partially paid — ${formatUSD(b.balanceDueUsd)} still due.` : 'paid in full.'}
      </p>
      <div>${button('View booking', confirmationUrl(b.id))}</div>
    `),
  };
}

export function balanceDueTemplate(b: BookingRecord, payUrl?: string) {
  return {
    subject: `Balance due on your booking — ${bookingRef(b.id)}`,
    html: shell(`
      <h1 style="font-size:20px; margin:0 0 12px;">Your booking was updated.</h1>
      <p style="font-size:14px; line-height:1.6; color:#4a4a4a;">
        Booking <strong>${bookingRef(b.id)}</strong> now has a new total of
        <strong>${formatUSD(b.grandTotalUsd)}</strong>, leaving <strong>${formatUSD(b.balanceDueUsd)}</strong> due.
      </p>
      ${payUrl ? `<div>${button(`Pay ${formatUSD(b.balanceDueUsd)} now`, payUrl)}</div>` : ''}
    `),
  };
}

const STATUS_COPY: Record<string, string> = {
  in_transit: 'Your bags are on the way to storage.',
  deposited: 'Your bags are safely in storage.',
  picked_up: 'Your bags have been picked up. Thanks for storing with Luggage Storage Colombo!',
};

export function statusUpdateTemplate(b: BookingRecord, status: string) {
  return {
    subject: `Update on your booking — ${bookingRef(b.id)}`,
    html: shell(`
      <h1 style="font-size:20px; margin:0 0 12px;">${STATUS_COPY[status] ?? 'Your booking status changed.'}</h1>
      <p style="font-size:14px; line-height:1.6; color:#4a4a4a;">Booking <strong>${bookingRef(b.id)}</strong>.</p>
      <div>${button('View booking', confirmationUrl(b.id))}</div>
    `),
  };
}

export function otpCodeTemplate(code: string, purpose: 'booking_create' | 'booking_lookup') {
  const heading =
    purpose === 'booking_create' ? 'Verify your email to complete your booking' : 'Verify your email to view your bookings';
  return {
    subject: `Your verification code: ${code}`,
    html: shell(`
      <h1 style="font-size:20px; margin:0 0 12px;">${heading}</h1>
      <p style="font-size:14px; line-height:1.6; color:#4a4a4a;">Enter this code to continue. It expires in 10 minutes.</p>
      <div style="margin: 20px 0;">
        <span style="display:inline-block; font-size:32px; font-weight:800; letter-spacing:8px; background:#f5f0eb; color:#1C130E; padding:16px 28px; border-radius:14px;">${code}</span>
      </div>
      <p style="font-size:12px; line-height:1.6; color:#8a8a8a;">
        If you did not request this, you can safely ignore this email — no one can access your booking without also having access to this inbox.
      </p>
    `),
  };
}

export function bookingCancelledTemplate(b: BookingRecord, reason?: string) {
  return {
    subject: `Booking cancelled — ${bookingRef(b.id)}`,
    html: shell(`
      <h1 style="font-size:20px; margin:0 0 12px;">Booking ${bookingRef(b.id)} was cancelled.</h1>
      <p style="font-size:14px; line-height:1.6; color:#4a4a4a;">
        ${reason ? `Reason: ${reason}` : 'If you did not request this, please contact us.'}
      </p>
    `),
  };
}
