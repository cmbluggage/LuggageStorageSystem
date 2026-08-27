'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { AdminApiError } from '@/lib/admin/api';
import { notify } from '@/lib/toast';
import {
  PanelHeader, Section, ErrorBanner, EmptyState, TextField, NumberField, Toggle, ConfirmBar, useDeferredLoad,
} from './primitives';
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react';

/**
 * Generic editor for the admin-managed catalog tables.
 *
 * Item tiers, locations and add-ons differ only in their fields, so they
 * share this component rather than three near-identical 300-line tabs
 * (which is how the fields drifted apart in the first place — locations had
 * no active toggle, tiers had no validation).
 *
 * Rows are archived, never deleted: bookings hold foreign keys to tiers and
 * locations, so removing one would either fail or take booking history with it.
 */

export type FieldType = 'text' | 'number' | 'money' | 'toggle' | 'textarea';

export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  /** Grid span out of 2 columns. */
  wide?: boolean;
  min?: number;
  max?: number;
  /** Not editable after creation (e.g. the immutable code). */
  createOnly?: boolean;
}

export interface CatalogApi<Row> {
  list: (all?: boolean) => Promise<Row[]>;
  create: (payload: never) => Promise<unknown>;
  update: (payload: never) => Promise<unknown>;
  archive: (id: string) => Promise<unknown>;
}

interface CatalogEditorProps<Row extends { id: string; is_active: boolean }> {
  title: string;
  description: string;
  /** Singular noun used in buttons and confirmations. */
  noun: string;
  api: CatalogApi<Row>;
  fields: FieldDef<Row>[];
  blank: Omit<Row, 'id'>;
  /** Row headline in the list. */
  renderTitle: (row: Row) => React.ReactNode;
  /** Secondary line summarising the important values. */
  renderSummary: (row: Row) => React.ReactNode;
}

export function CatalogEditor<Row extends { id: string; is_active: boolean }>({
  title,
  description,
  noun,
  api,
  fields,
  blank,
  renderTitle,
  renderSummary,
}: CatalogEditorProps<Row>) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<Row>>(blank as Partial<Row>);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await api.list(true));
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : `Could not load ${noun}s.`);
    } finally {
      setLoading(false);
    }
  }, [api, noun]);

  useDeferredLoad(load);

  const beginEdit = (row: Row) => {
    setEditingId(row.id);
    setDraft({ ...row });
    setFieldErrors({});
    setError('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusyId(editingId);
    setError('');
    setFieldErrors({});
    try {
      // Send only editable fields plus the id.
      const payload: Record<string, unknown> = { id: editingId };
      for (const f of fields) {
        if (!f.createOnly) payload[f.key] = draft[f.key];
      }
      payload.is_active = draft.is_active;

      await api.update(payload as never);
      await load();
      setEditingId(null);
      notify.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} updated successfully.`);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : `Could not update that ${noun}.`;
      setError(msg);
      notify.error(msg);
      if (e instanceof AdminApiError && e.fields) setFieldErrors(e.fields);
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    setBusyId('new');
    setError('');
    setFieldErrors({});
    try {
      await api.create(newDraft as never);
      await load();
      setCreating(false);
      setNewDraft(blank as Partial<Row>);
      notify.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} created successfully.`);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : `Could not create that ${noun}.`;
      setError(msg);
      notify.error(msg);
      if (e instanceof AdminApiError && e.fields) setFieldErrors(e.fields);
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await api.archive(id);
      await load();
      setConfirmArchive(null);
      notify.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} archived.`);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : `Could not archive that ${noun}.`;
      setError(msg);
      notify.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const reactivate = async (row: Row) => {
    setBusyId(row.id);
    try {
      await api.update({ id: row.id, is_active: true } as never);
      await load();
      notify.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} restored.`);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : `Could not restore that ${noun}.`;
      setError(msg);
      notify.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const active = rows.filter((r) => r.is_active);
  const archived = rows.filter((r) => !r.is_active);

  return (
    <div>
      <PanelHeader
        title={title}
        description={description}
        action={
          !creating && (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> Add {noun}
            </Button>
          )
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {creating && (
        <Section title={`New ${noun}`}>
          <FieldGrid
            fields={fields}
            draft={newDraft}
            errors={fieldErrors}
            idPrefix="new"
            onChange={(k, v) => setNewDraft((d) => ({ ...d, [k]: v }))}
          />
          <div className="flex items-center gap-2 mt-5">
            <Button variant="primary" size="sm" onClick={create} loading={busyId === 'new'}>
              Create {noun}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setNewDraft(blank as Partial<Row>);
                setFieldErrors({});
              }}
            >
              Cancel
            </Button>
          </div>
        </Section>
      )}

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : active.length === 0 && !creating ? (
        <EmptyState title={`No ${noun}s yet`} hint={`Add your first ${noun} to make it available in the booking flow.`} />
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((row) => (
            <article key={row.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {editingId === row.id ? (
                <div className="p-5">
                  <FieldGrid
                    fields={fields}
                    draft={draft}
                    errors={fieldErrors}
                    idPrefix={row.id}
                    onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
                  />
                  <div className="flex items-center gap-2 mt-5">
                    <Button variant="primary" size="sm" onClick={saveEdit} loading={busyId === row.id}>
                      Save changes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900">{renderTitle(row)}</div>
                      <div className="text-xs font-medium text-slate-500 mt-1">{renderSummary(row)}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => beginEdit(row)}
                        aria-label={`Edit ${noun}`}
                        className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900
                                   flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmArchive(row.id)}
                        aria-label={`Archive ${noun}`}
                        className="w-9 h-9 rounded-full hover:bg-red-50 text-slate-500 hover:text-red-600
                                   flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {confirmArchive === row.id && (
                    <div className="mt-3">
                      <ConfirmBar
                        message={`Archive this ${noun}? It will be hidden from customers but kept on existing bookings.`}
                        confirmLabel="Archive"
                        busy={busyId === row.id}
                        onConfirm={() => archive(row.id)}
                        onCancel={() => setConfirmArchive(null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="mt-8 group">
          <summary className="text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800">
            Archived ({archived.length})
          </summary>
          <div className="flex flex-col gap-2 mt-3">
            {archived.map((row) => (
              <div
                key={row.id}
                className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 opacity-60">
                  <div className="text-sm font-bold text-slate-700">{renderTitle(row)}</div>
                  <div className="text-xs font-medium text-slate-500">{renderSummary(row)}</div>
                </div>
                <button
                  onClick={() => reactivate(row)}
                  disabled={busyId === row.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                             text-slate-600 bg-white border border-slate-200 hover:bg-slate-100
                             transition-colors cursor-pointer flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Field rendering ─────────────────────────────────────────────

function FieldGrid<Row>({
  fields,
  draft,
  errors,
  idPrefix,
  onChange,
}: {
  fields: FieldDef<Row>[];
  draft: Partial<Row>;
  errors: Record<string, string>;
  idPrefix: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const raw = draft[f.key as keyof Row];
        const error = errors[f.key];

        if (f.type === 'toggle') {
          return (
            <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
              <Toggle
                id={id}
                label={f.label}
                description={f.hint}
                checked={Boolean(raw)}
                onChange={(v) => onChange(f.key, v)}
              />
            </div>
          );
        }

        if (f.type === 'number' || f.type === 'money') {
          return (
            <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
              <NumberField
                id={id}
                label={f.label}
                hint={f.hint}
                error={error}
                prefix={f.type === 'money' ? '$' : undefined}
                min={f.min}
                max={f.max}
                step={f.type === 'money' ? '0.01' : '1'}
                value={typeof raw === 'number' ? raw : Number(raw ?? 0)}
                onChange={(v) => onChange(f.key, v)}
              />
            </div>
          );
        }

        return (
          <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
            <TextField
              id={id}
              label={f.label}
              hint={f.hint}
              error={error}
              placeholder={f.placeholder}
              value={String(raw ?? '')}
              onChange={(v) => onChange(f.key, v)}
            />
          </div>
        );
      })}
    </div>
  );
}
