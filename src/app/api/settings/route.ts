import { getSettings, invalidateSettingsCache, toPublicSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { writeAudit } from '@/lib/audit';
import { isStripeConfigured } from '@/lib/stripe';
import { parseBody, settingsUpdateSchema } from '@/lib/validation/schemas';
import { badRequest, fail, ok, serverError, NO_STORE } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings — public subset used by the booking flow.
 * Security-relevant keys (rate limits, turnstile state) are not exposed.
 */
export async function GET() {
  try {
    const settings = await getSettings();
    return ok(
      {
        settings: toPublicSettings(settings),
        turnstileSiteKey: settings.turnstile_enabled
          ? (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null)
          : null,
        // Whether a live Stripe key is configured — never the key itself.
        // Lets the checkout page choose between the real redirect flow and
        // the no-gateway-configured dev fallback.
        stripeEnabled: isStripeConfigured(),
      },
      NO_STORE,
    );
  } catch (err) {
    return fail(err, 'settings.GET');
  }
}

/**
 * GET /api/settings?full=1 is deliberately not a thing — the admin panel
 * uses /api/admin/settings, which requires SuperAdmin and returns the full
 * rows including labels, categories and validation bounds.
 */

/**
 * PATCH /api/settings — SuperAdmin only.
 * Values are validated against each row's declared type and min/max before
 * being written, so the admin UI cannot push a value the app cannot parse.
 */
export async function PATCH(req: Request) {
  try {
    const actor = await requireSuperAdmin();
    const { settings: updates } = await parseBody(req, settingsUpdateSchema);

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase.from('app_settings').select('*');
    if (error) {
      console.error('[settings.PATCH] read failed:', error);
      throw serverError('We could not load the current settings.');
    }

    const byKey = new Map((rows ?? []).map((r) => [r.key, r]));
    const applied: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(updates)) {
      const row = byKey.get(key);
      if (!row) throw badRequest(`Unknown setting: ${key}`);

      let value: unknown;
      switch (row.value_type) {
        case 'boolean': {
          if (typeof raw !== 'boolean') throw badRequest(`"${row.label}" must be true or false.`);
          value = raw;
          break;
        }
        case 'number': {
          const n = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(n)) throw badRequest(`"${row.label}" must be a number.`);
          if (row.min_value !== null && n < Number(row.min_value)) {
            throw badRequest(`"${row.label}" cannot be lower than ${row.min_value}.`);
          }
          if (row.max_value !== null && n > Number(row.max_value)) {
            throw badRequest(`"${row.label}" cannot be higher than ${row.max_value}.`);
          }
          value = n;
          break;
        }
        default: {
          if (typeof raw !== 'string') throw badRequest(`"${row.label}" must be text.`);
          if (!raw.trim()) throw badRequest(`"${row.label}" cannot be empty.`);
          value = raw.trim();
        }
      }

      const { error: updateErr } = await supabase
        .from('app_settings')
        .update({ value: value as never, updated_by: actor.userId })
        .eq('key', key);

      if (updateErr) {
        console.error('[settings.PATCH] write failed:', key, updateErr);
        throw serverError(`We could not save "${row.label}".`);
      }
      applied[key] = value;
    }

    invalidateSettingsCache();

    await writeAudit({
      tableName: 'app_settings',
      recordId: Object.keys(applied).join(','),
      action: 'UPDATE',
      summary: `Updated ${Object.keys(applied).length} setting(s): ${Object.keys(applied).join(', ')}`,
      actor,
      newValues: applied,
    });

    const fresh = await getSettings(true);
    return ok({ settings: fresh }, NO_STORE);
  } catch (err) {
    return fail(err, 'settings.PATCH');
  }
}

export { DEFAULT_SETTINGS };
