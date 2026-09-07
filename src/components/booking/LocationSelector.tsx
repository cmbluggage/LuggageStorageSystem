'use client';

import React from 'react';
import { formatUSD } from '@/lib/currency';
import { MapPin, Plane, Check, CreditCard } from 'lucide-react';
import { isAirportLocation } from '@/lib/locations';

export interface Location {
  id: string;
  code: string;
  name: string;
  is_airport: boolean;
  dropoff_surcharge_usd: number;
  pickup_surcharge_usd: number;
  requires_stripe: boolean;
  allows_cash: boolean;
  /** Admin-editable label shown for this location in the drop-off picker only. Falls back to `name`. */
  dropoff_display_name?: string | null;
  /** Admin-editable label shown for this location in the pick-up picker only. Falls back to `name`. */
  pickup_display_name?: string | null;
}

interface LocationSelectorProps {
  locations: Location[];
  dropoffId: string | null;
  pickupId: string | null;
  onDropoffChange: (id: string) => void;
  onPickupChange: (id: string) => void;
}

export function LocationSelector({
  locations,
  dropoffId,
  pickupId,
  onDropoffChange,
  onPickupChange,
}: LocationSelectorProps) {
  const dropoff = locations.find((l) => l.id === dropoffId);
  const pickup = locations.find((l) => l.id === pickupId);
  const cardOnly = isAirportLocation(dropoff) || isAirportLocation(pickup);

  return (
    <div className="flex flex-col gap-6" id="location-selector">
      {/* Drop-off section */}
      <LegPicker
        legend="Drop-off Location"
        hint="Where you hand your bags over"
        locations={locations}
        selectedId={dropoffId}
        onSelect={onDropoffChange}
        surchargeOf={(l) => l.dropoff_surcharge_usd}
        nameOf={(l) => l.dropoff_display_name || l.name}
        namePrefix="dropoff"
      />

      {/* Pick-up section */}
      <LegPicker
        legend="Pick-up Location"
        hint="Where you collect your bags again"
        locations={locations}
        selectedId={pickupId}
        onSelect={onPickupChange}
        surchargeOf={(l) => l.pickup_surcharge_usd}
        nameOf={(l) => l.pickup_display_name || l.name}
        namePrefix="pickup"
      />

      {/* Airport card notice */}
      {cardOnly && (
        <div
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 shadow-2xs"
          id="airport-payment-notice"
        >
          <CreditCard className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
          <p className="text-xs font-semibold">
            Airport bookings require card payment at checkout.
          </p>
        </div>
      )}
    </div>
  );
}

interface LegPickerProps {
  legend: string;
  hint: string;
  locations: Location[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  surchargeOf: (l: Location) => number;
  nameOf: (l: Location) => string;
  namePrefix: string;
}

function LegPicker({
  legend,
  hint,
  locations,
  selectedId,
  onSelect,
  surchargeOf,
  nameOf,
  namePrefix,
}: LegPickerProps) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="flex items-center gap-2 text-base font-extrabold text-[#1C130E] mb-1 p-0">
        <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-4 h-4" aria-hidden="true" />
        </span>
        {legend}
      </legend>
      <p className="text-xs font-medium text-slate-500 mb-3.5 pl-9">{hint}</p>

      {/* Grid of locations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {locations.map((loc) => {
          const selected = selectedId === loc.id;
          const surcharge = surchargeOf(loc);
          const airport = isAirportLocation(loc);
          const inputId = `${namePrefix}-${loc.id}`;

          return (
            <label
              key={loc.id}
              htmlFor={inputId}
              className={[
                'relative flex items-center gap-3.5 p-4 rounded-2xl border-2 cursor-pointer',
                'transition-all duration-200 select-none shadow-2xs',
                'focus-within:ring-2 focus-within:ring-orange-600/30 focus-within:ring-offset-1',
                selected
                  ? 'border-orange-600 bg-orange-50/60 ring-1 ring-orange-600/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
              ].join(' ')}
            >
              <input
                type="radio"
                id={inputId}
                name={namePrefix}
                value={loc.id}
                checked={selected}
                onChange={() => onSelect(loc.id)}
                className="sr-only"
              />

              {/* Selection indicator icon */}
              <span
                className={[
                  'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                  selected ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500',
                ].join(' ')}
                aria-hidden="true"
              >
                {selected ? (
                  <Check className="w-5 h-5" strokeWidth={3} />
                ) : airport ? (
                  <Plane className="w-5 h-5 text-slate-600" />
                ) : (
                  <MapPin className="w-5 h-5 text-slate-600" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-[#1C130E] leading-snug">
                    {nameOf(loc)}
                  </span>
                  {airport && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200/60">
                      Airport Hub
                    </span>
                  )}
                </span>

                {surcharge > 0 ? (
                  <span className="block mt-1 text-xs font-bold text-orange-700">
                    +{formatUSD(surcharge)} service fee
                  </span>
                ) : (
                  <span className="block mt-0.5 text-xs font-medium text-slate-400">
                    Standard drop point
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
