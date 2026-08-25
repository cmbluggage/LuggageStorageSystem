import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';

/**
 * Dynamic app configuration — server side.
 *
 * Everything an operator might want to retune (insurance on/off, the
 * long-stay threshold, airport fee, booking limits, support numbers) lives
 * in `public.app_settings` rather than in code, so the admin panel can
 * change it without a redeploy.
 *
 * DEFAULTS below are the contract: they are what the app uses when the DB
 * is unreachable or a key has not been seeded. Keep them in sync with the
 * seed block in migration 004.
 */

export interface AppSettings {
  insurance_enabled: boolean;
  insurance_default_on: boolean;
  insurance_label: string;
  week_threshold_days: number;
  airport_service_fee_usd: number;
  min_booking_days: number;
  max_booking_days: number;
  max_items_per_booking: number;
  max_qty_per_tier: number;
  booking_lead_time_hours: number;
  booking_horizon_days: number;
  usd_to_lkr_rate: number;
  exchange_rate_live: boolean;
  support_phone: string;
  support_whatsapp: string;
  turnstile_enabled: boolean;
  booking_rate_limit: number;
  ops_window_hours: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  insurance_enabled: true,
  insurance_default_on: false,
  insurance_label: 'Damage & Loss Protection',
  week_threshold_days: 7,
  airport_service_fee_usd: 10.0,
  min_booking_days: 1,
  max_booking_days: 90,
  max_items_per_booking: 20,
  max_qty_per_tier: 10,
  booking_lead_time_hours: 0,
  booking_horizon_days: 365,
  usd_to_lkr_rate: 320,
  exchange_rate_live: true,
  support_phone: '+94770000000',
  support_whatsapp: '+94770000000',
  turnstile_enabled: false,
  booking_rate_limit: 10,
  ops_window_hours: 48,
};

export const DEFAULT_SETTING_METADATA: Record<
  SettingKey,
  {
    label: string;
    description: string;
    category: string;
    value_type: 'boolean' | 'number' | 'string' | 'json';
    min_value?: number;
    max_value?: number;
  }
> = {
  insurance_enabled: {
    label: 'Insurance Available',
    description: 'Master switch. When off, the insurance step is hidden from customers and never billed.',
    category: 'insurance',
    value_type: 'boolean',
  },
  insurance_default_on: {
    label: 'Insurance Pre-selected',
    description: 'Whether the insurance toggle starts enabled in the booking flow.',
    category: 'insurance',
    value_type: 'boolean',
  },
  insurance_label: {
    label: 'Insurance Display Name',
    description: 'Customer-facing name for the insurance product.',
    category: 'insurance',
    value_type: 'string',
  },
  week_threshold_days: {
    label: 'Long-stay Threshold (days)',
    description: "Bookings longer than this use each tier's discounted long-stay day rate for ALL days.",
    category: 'pricing',
    value_type: 'number',
    min_value: 1,
    max_value: 365,
  },
  airport_service_fee_usd: {
    label: 'Airport Handling Fee (USD)',
    description: 'Flat fee applied when either leg of the booking is an airport location.',
    category: 'pricing',
    value_type: 'number',
    min_value: 0,
    max_value: 1000,
  },
  min_booking_days: {
    label: 'Minimum Billable Days',
    description: 'Floor applied to every booking duration.',
    category: 'pricing',
    value_type: 'number',
    min_value: 1,
    max_value: 365,
  },
  max_booking_days: {
    label: 'Maximum Booking Length',
    description: 'Bookings longer than this are rejected.',
    category: 'pricing',
    value_type: 'number',
    min_value: 1,
    max_value: 3650,
  },
  max_items_per_booking: {
    label: 'Max Items Per Booking',
    description: 'Total quantity across all tiers allowed in a single booking.',
    category: 'limits',
    value_type: 'number',
    min_value: 1,
    max_value: 500,
  },
  max_qty_per_tier: {
    label: 'Max Quantity Per Tier',
    description: 'Maximum units of any single item tier in one booking.',
    category: 'limits',
    value_type: 'number',
    min_value: 1,
    max_value: 100,
  },
  booking_lead_time_hours: {
    label: 'Minimum Lead Time (hours)',
    description: 'How far in advance a drop-off must be booked. 0 allows immediate bookings.',
    category: 'limits',
    value_type: 'number',
    min_value: 0,
    max_value: 720,
  },
  booking_horizon_days: {
    label: 'Booking Horizon (days)',
    description: 'How far into the future a drop-off may be scheduled.',
    category: 'limits',
    value_type: 'number',
    min_value: 1,
    max_value: 3650,
  },
  usd_to_lkr_rate: {
    label: 'USD to LKR Fallback Rate',
    description: 'Used when the live exchange-rate feed is unavailable.',
    category: 'currency',
    value_type: 'number',
    min_value: 1,
    max_value: 100000,
  },
  exchange_rate_live: {
    label: 'Use Live Exchange Rate',
    description: 'Fetch the USD/LKR rate from the live feed. When off, the fallback rate above is used.',
    category: 'currency',
    value_type: 'boolean',
  },
  support_phone: {
    label: 'Support Phone',
    description: 'Shown to customers and used for the click-to-call action.',
    category: 'support',
    value_type: 'string',
  },
  support_whatsapp: {
    label: 'Support WhatsApp',
    description: 'Number behind the WhatsApp support button.',
    category: 'support',
    value_type: 'string',
  },
  turnstile_enabled: {
    label: 'Cloudflare Turnstile',
    description: 'Require a Turnstile challenge on booking creation. Needs the Turnstile env vars set.',
    category: 'security',
    value_type: 'boolean',
  },
  booking_rate_limit: {
    label: 'Bookings Per IP / Hour',
    description: 'Rate limit on booking creation per client IP.',
    category: 'security',
    value_type: 'number',
    min_value: 1,
    max_value: 1000,
  },
  ops_window_hours: {
    label: 'Operations Window (hours)',
    description: 'How far ahead the staff dashboard looks for upcoming drop-offs and pick-ups.',
    category: 'operations',
    value_type: 'number',
    min_value: 1,
    max_value: 720,
  },
};

export function getDefaultSettingRows() {
  return (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).map((key) => {
    const meta = DEFAULT_SETTING_METADATA[key];
    return {
      key,
      value: DEFAULT_SETTINGS[key],
      value_type: meta.value_type,
      label: meta.label,
      description: meta.description,
      category: meta.category,
      min_value: meta.min_value ?? null,
      max_value: meta.max_value ?? null,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
  });
}

export type SettingKey = keyof AppSettings;

/**
 * Short-lived cache. Settings change rarely but are read on every booking
 * request; 30s keeps admin edits feeling immediate without hammering the DB.
 */
const CACHE_TTL_MS = 30_000;
let cache: { value: AppSettings; expiresAt: number } | null = null;

function coerce<K extends SettingKey>(key: K, raw: unknown): AppSettings[K] {
  const fallback = DEFAULT_SETTINGS[key];

  if (typeof fallback === 'boolean') {
    if (typeof raw === 'boolean') return raw as AppSettings[K];
    if (raw === 'true') return true as AppSettings[K];
    if (raw === 'false') return false as AppSettings[K];
    return fallback;
  }

  if (typeof fallback === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return (Number.isFinite(n) ? n : fallback) as AppSettings[K];
  }

  // string
  if (typeof raw === 'string' && raw.trim()) return raw as AppSettings[K];
  return fallback;
}

/** Load all settings, merged over defaults. Never throws. */
export async function getSettings(force = false): Promise<AppSettings> {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) return cache.value;

  if (!isServiceRoleConfigured()) return DEFAULT_SETTINGS;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) throw error;

    const merged = { ...DEFAULT_SETTINGS };
    for (const row of data ?? []) {
      const key = row.key as SettingKey;
      if (key in merged) {
        // @ts-expect-error — key is narrowed by the `in` check above
        merged[key] = coerce(key, row.value);
      }
    }

    cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
    return merged;
  } catch (e) {
    console.error('[settings] falling back to defaults:', e);
    return cache?.value ?? DEFAULT_SETTINGS;
  }
}

/** Invalidate the cache after an admin write so the change lands at once. */
export function invalidateSettingsCache() {
  cache = null;
}

/**
 * Settings the public booking flow is allowed to see. Security-relevant
 * keys (rate limits, turnstile state beyond the site key) stay server-side.
 */
export type PublicSettings = Pick<
  AppSettings,
  | 'insurance_enabled'
  | 'insurance_default_on'
  | 'insurance_label'
  | 'week_threshold_days'
  | 'airport_service_fee_usd'
  | 'min_booking_days'
  | 'max_booking_days'
  | 'max_items_per_booking'
  | 'max_qty_per_tier'
  | 'booking_lead_time_hours'
  | 'booking_horizon_days'
  | 'usd_to_lkr_rate'
  | 'support_phone'
  | 'support_whatsapp'
>;

export function toPublicSettings(s: AppSettings): PublicSettings {
  return {
    insurance_enabled: s.insurance_enabled,
    insurance_default_on: s.insurance_default_on,
    insurance_label: s.insurance_label,
    week_threshold_days: s.week_threshold_days,
    airport_service_fee_usd: s.airport_service_fee_usd,
    min_booking_days: s.min_booking_days,
    max_booking_days: s.max_booking_days,
    max_items_per_booking: s.max_items_per_booking,
    max_qty_per_tier: s.max_qty_per_tier,
    booking_lead_time_hours: s.booking_lead_time_hours,
    booking_horizon_days: s.booking_horizon_days,
    usd_to_lkr_rate: s.usd_to_lkr_rate,
    support_phone: s.support_phone,
    support_whatsapp: s.support_whatsapp,
  };
}
