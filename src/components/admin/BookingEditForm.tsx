'use client';

import React, { useState, useEffect } from 'react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomDatePicker } from '@/components/ui/CustomDatePicker';
import { Button } from '@/components/ui/Button';
import { bookingsApi, AdminApiError } from '@/lib/admin/api';
import { notify } from '@/lib/toast';
import type { BookingRecord } from '@/lib/db';
import type { Location } from '@/components/booking/LocationSelector';

/**
 * Shared by BookingsPanel (SuperAdmin, /admin) and the staff dashboard
 * (/staff) so both roles edit a booking the same way. Scope is deliberately
 * limited to customer details, notes, and the drop-off/pick-up schedule —
 * item quantities are not editable here (would need a booking_items diff +
 * re-pricing of a changed item list, out of scope for this pass).
 */

interface DateTimeParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

function splitIso(iso: string): DateTimeParts {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function joinIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function BookingEditForm({
  booking,
  onSaved,
  onCancel,
}: {
  booking: BookingRecord;
  onSaved: (updated: BookingRecord, balanceNowDue: boolean) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(booking.fullName);
  const [email, setEmail] = useState(booking.email);
  const [flightNumber, setFlightNumber] = useState(booking.flightNumber ?? '');
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [dropoffLocationId, setDropoffLocationId] = useState(booking.dropoffLocationId);
  const [pickupLocationId, setPickupLocationId] = useState(booking.pickupLocationId);
  const [dropoff, setDropoff] = useState<DateTimeParts>(splitIso(booking.dropoffTime));
  const [pickup, setPickup] = useState<DateTimeParts>(splitIso(booking.pickupTime));

  const [locations, setLocations] = useState<Location[]>([]);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/locations')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setLocations(Array.isArray(data?.locations) ? data.locations : []))
      .catch(() => setLocations([]));
  }, []);

  const locationOptions = locations.map((l) => ({
    value: l.id,
    label: l.name,
    sublabel: l.is_airport ? 'Airport — forces card payment' : undefined,
  }));

  const handleSave = async () => {
    setFieldErrors({});
    const dropoffTime = joinIso(dropoff.date, dropoff.time);
    const pickupTime = joinIso(pickup.date, pickup.time);
    if (!dropoffTime || !pickupTime) {
      notify.error('Enter a valid drop-off and pick-up date/time.');
      return;
    }

    const patch: Record<string, unknown> = {};
    if (fullName.trim() !== booking.fullName) patch.fullName = fullName.trim();
    if (email.trim() !== booking.email) patch.email = email.trim();
    if (flightNumber.trim() !== (booking.flightNumber ?? '')) patch.flightNumber = flightNumber.trim();
    if (notes !== (booking.notes ?? '')) patch.notes = notes;
    if (dropoffLocationId !== booking.dropoffLocationId) patch.dropoffLocationId = dropoffLocationId;
    if (pickupLocationId !== booking.pickupLocationId) patch.pickupLocationId = pickupLocationId;
    if (dropoffTime !== booking.dropoffTime) patch.dropoffTime = dropoffTime;
    if (pickupTime !== booking.pickupTime) patch.pickupTime = pickupTime;

    if (Object.keys(patch).length === 0) {
      notify.info('No changes to save.');
      onCancel();
      return;
    }

    setSaving(true);
    try {
      const { booking: updated, balanceNowDue } = await bookingsApi.updateDetails(booking.id, patch);
      notify.success(
        balanceNowDue
          ? `Saved — new total is higher, balance is now marked unpaid.`
          : 'Booking updated.',
      );
      onSaved(updated, balanceNowDue);
    } catch (e) {
      if (e instanceof AdminApiError) {
        notify.error(e.message);
        if (e.fields) setFieldErrors(e.fields);
      } else {
        notify.error('Could not save those changes.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name" error={fieldErrors.fullName}>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-600"
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-600"
          />
        </Field>
      </div>

      <Field label="Flight #" error={fieldErrors.flightNumber}>
        <input
          value={flightNumber}
          onChange={(e) => setFlightNumber(e.target.value)}
          placeholder="e.g. UL 504"
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-600"
        />
      </Field>

      <Field label="Notes" error={fieldErrors.notes}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-600 resize-none"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Drop-off location">
          <CustomSelect value={dropoffLocationId} onChange={setDropoffLocationId} options={locationOptions} />
        </Field>
        <Field label="Pick-up location">
          <CustomSelect value={pickupLocationId} onChange={setPickupLocationId} options={locationOptions} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Drop-off date & time" error={fieldErrors.dropoffTime}>
          <div className="flex flex-col gap-1.5">
            <CustomDatePicker value={dropoff.date} onChange={(date) => setDropoff((p) => ({ ...p, date }))} />
            <input
              type="time"
              value={dropoff.time}
              onChange={(e) => setDropoff((p) => ({ ...p, time: e.target.value }))}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-600"
            />
          </div>
        </Field>
        <Field label="Pick-up date & time" error={fieldErrors.pickupTime}>
          <div className="flex flex-col gap-1.5">
            <CustomDatePicker value={pickup.date} onChange={(date) => setPickup((p) => ({ ...p, date }))} />
            <input
              type="time"
              value={pickup.time}
              onChange={(e) => setPickup((p) => ({ ...p, time: e.target.value }))}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-600"
            />
          </div>
        </Field>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          Save changes
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
