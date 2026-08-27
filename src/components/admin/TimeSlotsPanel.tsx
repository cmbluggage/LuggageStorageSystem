'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { timeSlotsApi, AdminApiError, type TimeSlotInput } from '@/lib/admin/api';
import { notify } from '@/lib/toast';
import {
  PanelHeader, Section, ErrorBanner, EmptyState, TextField, ConfirmBar, useDeferredLoad,
} from './primitives';
import { Plus, Trash2, CalendarDays, Clock } from 'lucide-react';

/**
 * Operating schedule.
 *
 * Two kinds of row: recurring slots bound to a weekday (or all days), and
 * one-off overrides for a specific date. When a date has any override, it
 * replaces the recurring set for that date entirely — matching what
 * GET /api/time-slots resolves.
 *
 * The schedule is edited as a document and saved with a single PUT, so a
 * half-applied set of edits cannot leave the operation without hours.
 */

const WEEKDAYS = [
  { value: 'all', label: 'Every day' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

type Draft = TimeSlotInput & { _localId: string };

let localCounter = 0;
const nextLocalId = () => `local-${++localCounter}`;

/** A slot with no `id` has not been persisted yet; PUT will insert it. */
function toDraft(row: Omit<TimeSlotInput, 'id'> & { id?: string }): Draft {
  return { ...row, _localId: nextLocalId() } as Draft;
}

/** Human label derived from the times, so operators don't hand-write it. */
function autoLabel(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${String(h % 12 || 12).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

export function TimeSlotsPanel() {
  const [slots, setSlots] = useState<Draft[]>([]);
  const [original, setOriginal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await timeSlotsApi.list();
      const drafts = rows.map((r) =>
        toDraft({
          id: r.id,
          label: r.label,
          start_time: r.start_time,
          end_time: r.end_time,
          slot_type: r.slot_type,
          day_of_week: r.day_of_week,
          specific_date: r.specific_date,
          is_active: r.is_active,
        }),
      );
      setSlots(drafts);
      setOriginal(
        JSON.stringify(
          drafts.map(({ _localId, ...s }) => {
            void _localId;
            return s;
          }),
        ),
      );
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useDeferredLoad(load);

  const dirty = useMemo(
    () =>
      JSON.stringify(
        slots.map(({ _localId, ...s }) => {
          void _localId;
          return s;
        }),
      ) !== original,
    [slots, original],
  );

  const update = (localId: string, patch: Partial<Draft>) =>
    setSlots((prev) =>
      prev.map((s) => {
        if (s._localId !== localId) return s;
        const next = { ...s, ...patch };
        // Keep the label in step unless the operator typed their own.
        if ((patch.start_time || patch.end_time) && s.label === autoLabel(s.start_time, s.end_time)) {
          next.label = autoLabel(next.start_time, next.end_time);
        }
        return next;
      }),
    );

  const addSlot = (specificDate: string | null) => {
    setSlots((prev) => [
      ...prev,
      toDraft({
        label: autoLabel('09:00', '11:00'),
        start_time: '09:00',
        end_time: '11:00',
        slot_type: 'window',
        day_of_week: 'all',
        specific_date: specificDate,
        is_active: true,
      }),
    ]);
    notify.info('New time slot added (unsaved).');
  };

  const remove = (localId: string) => {
    setSlots((prev) => prev.filter((s) => s._localId !== localId));
    notify.info('Time slot removed (unsaved).');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = slots.map(({ _localId, ...s }) => {
        void _localId;
        return s;
      });
      await timeSlotsApi.replace(payload);
      await load();
      notify.success('Operating schedule saved successfully.');
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'Could not save the schedule.';
      setError(msg);
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const recurring = slots.filter((s) => !s.specific_date);
  const overrides = slots.filter((s) => s.specific_date);

  const overridesByDate = useMemo(() => {
    const map = new Map<string, Draft[]>();
    for (const s of overrides) {
      const list = map.get(s.specific_date!);
      if (list) list.push(s);
      else map.set(s.specific_date!, [s]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [overrides]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <PanelHeader
        title="Operating Schedule"
        description="Times customers can choose for drop-off and pick-up. Saved as one set — nothing changes until you save."
        action={
          <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>
            {dirty ? 'Save schedule' : 'Saved'}
          </Button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {dirty && (
        <div className="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">
          You have unsaved changes to the schedule.
        </div>
      )}

      <Section
        title="Recurring hours"
        description="Applied every week. A slot set to a specific weekday only appears on that day."
      >
        {recurring.length === 0 ? (
          <EmptyState title="No recurring hours" hint="Customers cannot book until at least one slot exists." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {recurring.map((slot) => (
              <SlotRow key={slot._localId} slot={slot} onUpdate={update} onRemove={remove} showWeekday />
            ))}
          </div>
        )}

        <button
          onClick={() => addSlot(null)}
          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
                     text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add recurring slot
        </button>
      </Section>

      <Section
        title="Date overrides"
        description="Replaces the recurring hours for one date — public holidays, reduced-staff days, special events."
      >
        {overridesByDate.length === 0 ? (
          <EmptyState title="No date overrides" hint="Recurring hours apply on every date." />
        ) : (
          <div className="flex flex-col gap-5">
            {overridesByDate.map(([date, list]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-orange-600" />
                  <p className="text-sm font-extrabold text-slate-900">
                    {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5 pl-6">
                  {list.map((slot) => (
                    <SlotRow key={slot._localId} slot={slot} onUpdate={update} onRemove={remove} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-end gap-2 flex-wrap">
          <div className="w-full sm:w-56">
            <TextField
              id="override-date"
              label="Add override for date"
              type="date"
              value=""
              onChange={(v) => v && addSlot(v)}
            />
          </div>
        </div>
      </Section>

      {slots.length > 0 && (
        <div className="mt-6">
          {confirmClear ? (
            <ConfirmBar
              message="Remove every slot? Customers will not be able to book any time until you add hours back."
              confirmLabel="Remove all"
              onConfirm={() => {
                setSlots([]);
                setConfirmClear(false);
              }}
              onCancel={() => setConfirmClear(false)}
            />
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              Clear all slots
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  onUpdate,
  onRemove,
  showWeekday,
}: {
  slot: Draft;
  onUpdate: (localId: string, patch: Partial<Draft>) => void;
  onRemove: (localId: string) => void;
  showWeekday?: boolean;
}) {
  const invalid = slot.start_time >= slot.end_time;

  return (
    <div
      className={[
        'rounded-xl border p-3 flex flex-wrap items-end gap-3',
        invalid ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-slate-50',
        slot.is_active ? '' : 'opacity-60',
      ].join(' ')}
    >
      <div className="w-28">
        <label htmlFor={`${slot._localId}-start`} className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
          From
        </label>
        <input
          id={`${slot._localId}-start`}
          type="time"
          value={slot.start_time}
          onChange={(e) => onUpdate(slot._localId, { start_time: e.target.value })}
          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-bold text-slate-900
                     focus:outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20"
        />
      </div>

      <div className="w-28">
        <label htmlFor={`${slot._localId}-end`} className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
          To
        </label>
        <input
          id={`${slot._localId}-end`}
          type="time"
          value={slot.end_time}
          onChange={(e) => onUpdate(slot._localId, { end_time: e.target.value })}
          className={[
            'w-full bg-white border rounded-lg px-2.5 py-2 text-sm font-bold text-slate-900',
            'focus:outline-none focus:ring-2',
            invalid
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-300 focus:border-orange-600 focus:ring-orange-600/20',
          ].join(' ')}
        />
      </div>

      {showWeekday && (
        <div className="w-36">
          <label htmlFor={`${slot._localId}-day`} className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Applies to
          </label>
          {/* A native select is used here rather than CustomSelect: this is an
              internal admin table row, not a customer-facing control. */}
          <select
            id={`${slot._localId}-day`}
            value={slot.day_of_week}
            onChange={(e) => onUpdate(slot._localId, { day_of_week: e.target.value })}
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-bold text-slate-900
                       focus:outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20"
          >
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="w-32">
        <label htmlFor={`${slot._localId}-type`} className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
          Precision
        </label>
        <select
          id={`${slot._localId}-type`}
          value={slot.slot_type}
          onChange={(e) => onUpdate(slot._localId, { slot_type: e.target.value as 'window' | 'hourly' })}
          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-bold text-slate-900
                     focus:outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20"
        >
          <option value="window">Window</option>
          <option value="hourly">Hourly</option>
        </select>
      </div>

      <div className="flex items-center gap-3 ml-auto pb-1">
        <button
          type="button"
          role="switch"
          aria-checked={slot.is_active}
          onClick={() => onUpdate(slot._localId, { is_active: !slot.is_active })}
          className="flex items-center gap-1.5 cursor-pointer select-none"
        >
          <span className="text-xs font-bold text-slate-600">Active</span>
          <span
            className={[
              'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
              slot.is_active ? 'bg-orange-600' : 'bg-slate-300',
            ].join(' ')}
          >
            <span
              className={[
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                slot.is_active ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </span>
        </button>
        <button
          onClick={() => onRemove(slot._localId)}
          aria-label="Remove slot"
          className="w-8 h-8 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600
                     flex items-center justify-center transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {invalid && (
        <p className="w-full text-[11px] font-bold text-red-600 flex items-center gap-1">
          <Clock className="w-3 h-3" /> End time must be after the start time.
        </p>
      )}
    </div>
  );
}
