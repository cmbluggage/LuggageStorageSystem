'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { settingsApi, AdminApiError } from '@/lib/admin/api';
import { notify } from '@/lib/toast';
import type { AppSettingRow } from '@/lib/supabase/types';
import {
  PanelHeader, Section, ErrorBanner, TextField, NumberField, Toggle, SavedBadge, useDeferredLoad,
} from './primitives';
import { RotateCcw } from 'lucide-react';

/**
 * Business configuration.
 *
 * Everything an operator might retune lives in app_settings rather than in
 * code — the insurance master switch, the long-stay threshold, the airport
 * fee, booking limits, support numbers, Turnstile. The control rendered for
 * each row is chosen from its declared `value_type`, and numeric bounds
 * come from the row's own min/max, so adding a setting in a migration makes
 * it appear here with no UI change.
 */

const CATEGORY_ORDER = ['insurance', 'pricing', 'limits', 'currency', 'operations', 'support', 'security'];

const CATEGORY_COPY: Record<string, { title: string; description: string }> = {
  insurance: {
    title: 'Insurance',
    description:
      'Turning insurance off hides it from the booking flow and stops it being billed. The $ amount is set per item type under Item Tiers → Insurance fee, not here.',
  },
  pricing: {
    title: 'Pricing Rules',
    description: 'How duration is billed and which extra fees apply. Per-item rates live under Item Tiers.',
  },
  limits: {
    title: 'Booking Limits',
    description: 'Guardrails enforced server-side on every booking request.',
  },
  currency: { title: 'Currency', description: 'How USD prices are converted for the LKR display.' },
  operations: { title: 'Operations', description: 'Defaults for the staff dashboard.' },
  support: { title: 'Support Contact', description: 'Numbers customers are given for follow-up.' },
  security: { title: 'Security', description: 'Abuse protection on the public booking endpoint.' },
};

type Draft = Record<string, string | number | boolean>;

function valueOf(row: AppSettingRow): string | number | boolean {
  const v = row.value;
  if (row.value_type === 'boolean') return v === true || v === 'true';
  if (row.value_type === 'number') return typeof v === 'number' ? v : Number(v);
  return typeof v === 'string' ? v : String(v ?? '');
}

export function SettingsPanel() {
  const [rows, setRows] = useState<AppSettingRow[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { settings } = await settingsApi.list();
      setRows(settings);
      setDraft(Object.fromEntries(settings.map((r) => [r.key, valueOf(r)])));
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useDeferredLoad(load);

  /** Only send what actually changed, so an unrelated edit can't clobber. */
  const changed = useMemo(() => {
    const out: Draft = {};
    for (const row of rows) {
      const current = valueOf(row);
      if (draft[row.key] !== undefined && draft[row.key] !== current) out[row.key] = draft[row.key];
    }
    return out;
  }, [rows, draft]);

  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      await settingsApi.update(changed);
      await load();
      setJustSaved(true);
      const count = Object.keys(changed).length;
      notify.success(`Saved ${count} setting${count === 1 ? '' : 's'}.`);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'Could not save settings.';
      setError(msg);
      notify.error(msg);
      if (e instanceof AdminApiError && e.fields) setFieldErrors(e.fields);
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, AppSettingRow[]>();
    for (const row of rows) {
      const list = map.get(row.category);
      if (list) list.push(row);
      else map.set(row.category, [row]);
    }
    return [...map.entries()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 99) % 99 || CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    );
  }, [rows]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <PanelHeader
        title="Business Settings"
        description="Applies immediately across the booking flow, pricing engine and staff tools. No redeploy needed."
        action={
          <div className="flex items-center gap-3">
            <SavedBadge show={justSaved} />
            {dirty && (
              <button
                onClick={() => {
                  setDraft(Object.fromEntries(rows.map((r) => [r.key, valueOf(r)])));
                  notify.info('Discarded unsaved changes.');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800
                           transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Discard
              </button>
            )}
            <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>
              {dirty ? `Save ${Object.keys(changed).length} change(s)` : 'Saved'}
            </Button>
          </div>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {grouped.map(([category, items]) => {
        const copy = CATEGORY_COPY[category] ?? { title: category, description: '' };
        return (
          <Section key={category} title={copy.title} description={copy.description}>
            <div className="flex flex-col divide-y divide-slate-100">
              {items.map((row) => (
                <SettingControl
                  key={row.key}
                  row={row}
                  value={draft[row.key]}
                  error={fieldErrors[row.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, [row.key]: v }))}
                />
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function SettingControl({
  row,
  value,
  error,
  onChange,
}: {
  row: AppSettingRow;
  value: string | number | boolean | undefined;
  error?: string;
  onChange: (v: string | number | boolean) => void;
}) {
  const id = `setting-${row.key}`;

  if (row.value_type === 'boolean') {
    return (
      <Toggle
        id={id}
        label={row.label}
        description={row.description ?? undefined}
        checked={Boolean(value)}
        onChange={onChange}
      />
    );
  }

  const bounds =
    row.min_value !== null && row.max_value !== null
      ? `Between ${row.min_value} and ${row.max_value}.`
      : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2 sm:gap-4 items-start py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{row.label}</p>
        {row.description && <p className="text-xs font-medium text-slate-500 mt-0.5">{row.description}</p>}
      </div>

      {row.value_type === 'number' ? (
        <NumberField
          id={id}
          label=""
          value={typeof value === 'number' ? value : Number(value ?? 0)}
          onChange={onChange}
          error={error}
          hint={bounds}
          min={row.min_value ?? undefined}
          max={row.max_value ?? undefined}
          step="any"
        />
      ) : (
        <TextField
          id={id}
          label=""
          value={String(value ?? '')}
          onChange={onChange}
          error={error}
        />
      )}
    </div>
  );
}
