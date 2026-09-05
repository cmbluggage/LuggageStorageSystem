import { z } from 'zod';
import { badRequest } from '@/lib/api/http';

/**
 * Request validation for every route handler.
 *
 * Previously routes destructured `await req.json()` and trusted the shape,
 * so a malformed or hostile body reached the database layer. Each schema
 * below is the boundary: nothing past it is untyped.
 */

// ── Reusable primitives ──────────────────────────────────────────

/** Digits, spaces, and the usual separators; 8-20 digits after stripping. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required.')
  .max(32, 'Phone number is too long.')
  .refine((v) => /^[+]?[\d\s\-()]+$/.test(v), 'Phone number contains invalid characters.')
  .refine((v) => {
    const digits = v.replace(/\D/g, '').length;
    return digits >= 8 && digits <= 20;
  }, 'Enter a valid phone number including the country code.');

export const passportSchema = z
  .string()
  .trim()
  .min(3, 'Passport / NIC number must be at least 3 characters.')
  .max(32, 'Passport / NIC number is too long.')
  .regex(/^[A-Za-z0-9\-/ ]+$/, 'Passport / NIC may only contain letters, numbers, hyphens and slashes.');

export const emailSchema = z
  .string()
  .trim()
  .max(254, 'Email address is too long.')
  .email('Enter a valid email address.');

/** Accepts a UUID or one of the seeded slug ids ("loc-001", "item-002"). */
export const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier.');

export const uuidSchema = z.string().uuid('Invalid identifier.');

export const isoDateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date/time value.');

export const moneySchema = z
  .number()
  .finite('Amount must be a number.')
  .min(0, 'Amount cannot be negative.')
  .max(1_000_000, 'Amount is unrealistically large.');

const safeText = (max: number) => z.string().trim().max(max);

/** IATA-style flight designator, e.g. "UL 504", "AI-234". Optional everywhere it appears. */
export const flightNumberSchema = z
  .string()
  .trim()
  .max(16, 'Flight number is too long.')
  .regex(/^[A-Za-z0-9\- ]*$/, 'Flight number may only contain letters, numbers, hyphens and spaces.');

// ── Bookings ─────────────────────────────────────────────────────

export const bookingItemSchema = z.object({
  tierId: idSchema,
  qty: z.number().int('Quantity must be a whole number.').min(0).max(100),
});

export const createBookingSchema = z.object({
  phone: phoneSchema,
  fullName: safeText(120).min(2, 'Please enter your full name.'),
  email: emailSchema,
  passportNo: passportSchema,
  flightNumber: flightNumberSchema.optional().or(z.literal('')),
  notes: safeText(1000).optional().or(z.literal('')),
  dropoffLocationId: idSchema,
  pickupLocationId: idSchema,
  dropoffTime: isoDateTimeSchema,
  pickupTime: isoDateTimeSchema,
  items: z.array(bookingItemSchema).min(1, 'Select at least one item to store.').max(50),
  insuranceEnabled: z.boolean().default(false),
  /** Cloudflare Turnstile token, when the challenge is enabled. */
  turnstileToken: z.string().max(4096).optional(),
  /** Client-generated key so a double-submit cannot create two bookings. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  /** otp_verifications.id from a completed /api/otp/verify call for purpose 'booking_create', proving `email` above was verified. */
  emailVerificationId: z.string().trim().min(1).max(100),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updatePaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'stripe']),
  paymentStatus: z.enum(['pending', 'paid']).default('pending'),
});

export const bookingStatusSchema = z.object({
  bookingStatus: z.enum(['confirmed', 'in_transit', 'deposited', 'picked_up', 'cancelled']),
  cancelReason: safeText(500).optional(),
});

/** Accepts either a phone number or an email — resolved server-side to the on-file email. */
export const otpContactSchema = z
  .string()
  .trim()
  .min(1, 'Enter your phone number or email address.')
  .max(254, 'That value is too long.');

export const otpRequestSchema = z.object({
  contact: otpContactSchema,
  purpose: z.enum(['booking_create', 'booking_lookup']),
});

export const otpVerifySchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  purpose: z.enum(['booking_create', 'booking_lookup']),
});

export const myBookingsQuerySchema = z.object({
  verificationId: z.string().trim().min(1).max(100),
});

/** Staff/SuperAdmin edit of an existing booking. Every field optional — a PATCH sends only what changed. */
export const bookingEditSchema = z
  .object({
    fullName: safeText(120).min(2, 'Please enter a full name.').optional(),
    // No longer clearable to '' — email is NOT NULL on customers since
    // migration 008 (the OTP gate needs somewhere to send codes).
    email: emailSchema.optional(),
    flightNumber: flightNumberSchema.optional().or(z.literal('')),
    notes: safeText(1000).optional().or(z.literal('')),
    dropoffLocationId: idSchema.optional(),
    pickupLocationId: idSchema.optional(),
    dropoffTime: isoDateTimeSchema.optional(),
    pickupTime: isoDateTimeSchema.optional(),
  })
  .refine((s) => Object.keys(s).length > 0, 'No changes supplied.');

export type BookingEditInput = z.infer<typeof bookingEditSchema>;

// ── Admin: item tiers ────────────────────────────────────────────

export const itemTierSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores.'),
  name: safeText(120).min(2, 'Name is required.'),
  description: safeText(500),
  supported_items: safeText(500),
  weight_spec: safeText(120).nullable().optional(),
  icon_emoji: safeText(16).default('🧳'),
  /** Relative path under /public or an absolute http(s) URL. */
  image_url: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v),
      'Image must be a path starting with "/" or a full http(s) URL.',
    )
    .nullable()
    .optional(),
  rate_daily_usd: moneySchema,
  rate_weekly_usd: moneySchema,
  insurance_fee_usd: moneySchema,
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(0).max(9999).default(0),
});

export const itemTierUpdateSchema = itemTierSchema.partial().extend({ id: idSchema });

// ── Admin: locations ─────────────────────────────────────────────

export const locationSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores.'),
  name: safeText(120).min(2, 'Name is required.'),
  is_airport: z.boolean().default(false),
  dropoff_surcharge_usd: moneySchema.default(0),
  pickup_surcharge_usd: moneySchema.default(0),
  requires_stripe: z.boolean().default(false),
  allows_cash: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

export const locationUpdateSchema = locationSchema.partial().extend({ id: idSchema });

// ── Admin: addons ────────────────────────────────────────────────

export const addonSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores.'),
  name: safeText(120).min(2, 'Name is required.'),
  description: safeText(500),
  fee_usd: moneySchema,
  is_active: z.boolean().default(true),
});

export const addonUpdateSchema = addonSchema.partial().extend({ id: idSchema });

// ── Admin: time slots ────────────────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour HH:MM format.');

export const timeSlotSchema = z
  .object({
    id: idSchema.optional(),
    label: safeText(64).min(1, 'Label is required.'),
    start_time: hhmm,
    end_time: hhmm,
    slot_type: z.enum(['window', 'hourly']).default('window'),
    day_of_week: z.enum(['all', '0', '1', '2', '3', '4', '5', '6']).default('all'),
    specific_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.')
      .nullable()
      .optional(),
    is_active: z.boolean().default(true),
  })
  .refine((s) => s.start_time < s.end_time, {
    message: 'End time must be after start time.',
    path: ['end_time'],
  });

export const timeSlotsPayloadSchema = z.object({
  timeSlots: z.array(timeSlotSchema).max(200),
});

// ── Admin: app settings ──────────────────────────────────────────

export const settingsUpdateSchema = z.object({
  settings: z
    .record(
      z.string().min(1).max(64),
      z.union([z.string().max(500), z.number().finite(), z.boolean()]),
    )
    .refine((o) => Object.keys(o).length > 0, 'No settings supplied.')
    .refine((o) => Object.keys(o).length <= 50, 'Too many settings in one request.'),
});

// ── Helper ───────────────────────────────────────────────────────

/**
 * Parse a request body against a schema, converting Zod issues into a
 * 400 with the first human-readable message (plus per-field details).
 */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON.');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      const path = issue.path.join('.') || '_';
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    throw badRequest(issues[0]?.message ?? 'Invalid request.', fieldErrors);
  }
  return result.data;
}

/** Same as parseBody but for URL search params. */
export function parseQuery<T extends z.ZodType>(url: string, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid query parameters.');
  }
  return result.data;
}
