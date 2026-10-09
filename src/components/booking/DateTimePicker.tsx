'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Check } from 'lucide-react';
import { getTimeSlots, type TimeSlot } from '@/lib/timeSlots';
import { CustomDatePicker } from '@/components/ui/CustomDatePicker';
import { businessToday, parseBookingTime } from '@/lib/businessTime';

interface DateTimePickerProps {
  dropoffTime: string; // ISO string like 2026-07-26T10:00
  pickupTime: string;
  onDropoffChange: (time: string) => void;
  onPickupChange: (time: string) => void;
  /** Minimum notice before drop-off; slots inside it are greyed out. */
  leadTimeHours?: number;
}

function formatSlotDisplay(rawLabel: string): string {
  return rawLabel.replace(/^0/, '').replace(/ - 0/g, ' – ').replace(/ - /g, ' – ');
}

export function DateTimePicker({
  dropoffTime,
  pickupTime,
  onDropoffChange,
  onPickupChange,
  leadTimeHours = 0,
}: DateTimePickerProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  // Ticks each minute so slots grey out on their own if the page sits open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const targetDate = dropoffTime?.split('T')[0];
    const url = targetDate ? `/api/time-slots?date=${targetDate}` : '/api/time-slots';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.timeSlots && data.timeSlots.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped: TimeSlot[] = data.timeSlots.map((s: any) => ({
            id:           s.id,
            label:        s.label,
            startTime:    s.start_time || s.startTime,
            endTime:      s.end_time   || s.endTime,
            slotType:     s.slot_type  || s.slotType || 'window',
            active:       s.is_active  ?? s.active ?? true,
            dayOfWeek:    s.day_of_week || s.dayOfWeek,
            specificDate: s.specific_date || s.specificDate,
          })).filter((s: TimeSlot) => s.active);
          setSlots(mapped);
        } else {
          setSlots(getTimeSlots().filter((s) => s.active));
        }
      })
      .catch(() => setSlots(getTimeSlots().filter((s) => s.active)));
  }, [dropoffTime]);

  const splitDateTime = (isoString: string) => {
    if (!isoString) return { date: '', time: '10:00' };
    const [date, timePart] = isoString.split('T');
    return { date, time: timePart?.slice(0, 5) || '10:00' };
  };

  const dropoff = splitDateTime(dropoffTime);
  const pickup  = splitDateTime(pickupTime);

  const handleDateChange = (type: 'dropoff' | 'pickup', newDate: string) => {
    const currentTime = type === 'dropoff' ? dropoff.time : pickup.time;
    const timeToUse = currentTime || (slots[0]?.startTime || '10:00');

    if (type === 'dropoff') {
      onDropoffChange(`${newDate}T${timeToUse}`);
      if (pickup.date && pickup.date < newDate) {
        onPickupChange(`${newDate}T${timeToUse}`);
      } else if (pickup.date === newDate && pickup.time && pickup.time < timeToUse) {
        onPickupChange(`${newDate}T${timeToUse}`);
      }
    } else {
      if (dropoff.date && newDate < dropoff.date) {
        onPickupChange(`${dropoff.date}T${timeToUse}`);
      } else {
        onPickupChange(`${newDate}T${timeToUse}`);
      }
    }
  };

  const handleSlotSelect = (type: 'dropoff' | 'pickup', slot: TimeSlot) => {
    const currentDate = type === 'dropoff' ? dropoff.date : pickup.date;
    const dateToUse   = currentDate || businessToday();
    if (type === 'dropoff') {
      onDropoffChange(`${dateToUse}T${slot.startTime}`);
      if (pickup.date === dateToUse && pickup.time && pickup.time < slot.startTime) {
        onPickupChange(`${dateToUse}T${slot.startTime}`);
      }
    } else {
      onPickupChange(`${dateToUse}T${slot.startTime}`);
    }
  };

  // Slots are Colombo opening hours, so "today" and "too soon" are judged
  // on Colombo's clock, not the visitor's — an overseas customer's phone
  // can be hours ahead or behind.
  const minDateStr = businessToday(new Date(nowMs));
  const earliestDropoffMs = nowMs + leadTimeHours * 3600_000;

  const slotGrid = (type: 'dropoff' | 'pickup') => {
    const currentTime = type === 'dropoff' ? dropoff.time : pickup.time;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.map((slot) => {
          const isSelected = currentTime === slot.startTime;

          // If this is pickup slot selection and pickup date is the same as dropoff date,
          // any slot whose startTime is BEFORE dropoff.time is disabled/greyed out
          const isBeforeDropoff =
            type === 'pickup' &&
            Boolean(dropoff.date) &&
            Boolean(pickup.date) &&
            pickup.date === dropoff.date &&
            Boolean(dropoff.time) &&
            slot.startTime < dropoff.time;

          // Same 5-minute grace as the server's past-time check.
          const isTooSoon =
            type === 'dropoff' &&
            Boolean(dropoff.date) &&
            parseBookingTime(`${dropoff.date}T${slot.startTime}`).getTime() < earliestDropoffMs - 5 * 60_000;

          const isDisabled = isBeforeDropoff || isTooSoon;

          return (
            <button
              key={`${type}-slot-${slot.id}`}
              type="button"
              disabled={isDisabled}
              title={isTooSoon ? 'Too soon to book this slot. Please choose a later time.' : undefined}
              onClick={() => handleSlotSelect(type, slot)}
              className={[
                'py-2.5 px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold text-center transition-all flex flex-col items-center justify-center gap-1 leading-tight',
                isDisabled
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200 pointer-events-none'
                  : isSelected
                  ? 'bg-orange-600 text-white border-orange-600 shadow-xs ring-1 ring-orange-600 cursor-pointer'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300 cursor-pointer',
              ].join(' ')}
            >
              <span className="flex items-center gap-1">
                {isSelected && !isDisabled && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                <span>{formatSlotDisplay(slot.label)}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6" id="datetime-picker">
      {/* ── Drop-off ─────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Calendar className="w-5 h-5 text-orange-600" />
          <h4 className="font-bold text-slate-900 text-base">Drop-off Date & Time</h4>
        </div>
        <div className="mb-5">
          <CustomDatePicker
            label="Select Drop-off Date"
            value={dropoff.date}
            minDate={minDateStr}
            onChange={(d) => handleDateChange('dropoff', d)}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          Select Drop-off Time Window
        </label>
        {slotGrid('dropoff')}
      </div>

      {/* ── Pick-up ──────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Calendar className="w-5 h-5 text-orange-600" />
          <h4 className="font-bold text-slate-900 text-base">Pick-up Date & Time</h4>
        </div>
        <div className="mb-5">
          <CustomDatePicker
            label="Select Pick-up Date"
            value={pickup.date}
            minDate={dropoff.date || minDateStr}
            onChange={(d) => handleDateChange('pickup', d)}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          Select Pick-up Time Window
        </label>
        {slotGrid('pickup')}
      </div>
    </div>
  );
}
