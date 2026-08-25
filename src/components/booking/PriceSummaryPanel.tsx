'use client';

import React from 'react';
import { formatUSD, formatLKR } from '@/lib/currency';
import { MapPin, Calendar, Box, Plane, CheckCircle2, ShieldCheck } from 'lucide-react';
import { calculateGrandTotal, type PricingConfig } from '@/lib/pricing';
import type { ItemTier } from './ItemSelector';
import type { Location } from './LocationSelector';

interface PriceSummaryPanelProps {
  tiers: ItemTier[];
  quantities: Record<string, number>;
  dropoffTime: string;
  pickupTime: string;
  dropoffLocation: Location | null;
  pickupLocation: Location | null;
  /** Auto-derived: 0 if no airport location, the configured fee if involved */
  airportServiceFee: number;
  insuranceEnabled: boolean;
  /**
   * Pricing rules from the admin panel. Omitted only in previews — the
   * server recalculates the authoritative total either way, but passing
   * this keeps the customer's estimate matching what they will be charged.
   */
  config?: PricingConfig;
}

export function PriceSummaryPanel({
  tiers,
  quantities,
  dropoffTime,
  pickupTime,
  dropoffLocation,
  pickupLocation,
  airportServiceFee,
  insuranceEnabled,
  config,
}: PriceSummaryPanelProps) {
  const breakdown = calculateGrandTotal({
    tiers,
    quantities,
    dropoffISO:           dropoffTime,
    pickupISO:            pickupTime,
    dropoffSurchargeUsd:  dropoffLocation?.dropoff_surcharge_usd ?? 0,
    pickupSurchargeUsd:   pickupLocation?.pickup_surcharge_usd  ?? 0,
    airportServiceFeeUsd: airportServiceFee,
    insuranceEnabled,
    config,
  });

  const { duration, dropoffSurcharge, pickupSurcharge, insuranceFee, grandTotal } = breakdown;

  const selectedTiers = tiers.filter((t) => (quantities[t.id] ?? 0) > 0);
  const hasContent    = selectedTiers.length > 0 || dropoffLocation || pickupLocation;

  return (
    <div className="bg-white p-6 rounded-2xl border-2 border-[#1C130E] shadow-xl" id="price-summary-panel">
      <h3 className="text-xl font-black text-[#1C130E] mb-5">Booking Summary</h3>

      {!hasContent && (
        <p className="text-xs font-semibold text-slate-400 text-center py-4">
          Select items, location & dates to see your price.
        </p>
      )}

      <div className="flex flex-col gap-4 text-xs font-semibold">
        {/* Locations */}
        {dropoffLocation && (
          <div className="flex items-start gap-2.5 pb-3 border-b border-slate-100">
            <MapPin className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 font-bold uppercase text-[10px]">Drop-off</p>
              <p className="text-slate-900 font-bold truncate">{dropoffLocation.name}</p>
              {dropoffSurcharge > 0 && (
                <p className="text-orange-600 font-bold mt-0.5">+{formatUSD(dropoffSurcharge)} surcharge</p>
              )}
            </div>
          </div>
        )}

        {pickupLocation && (
          <div className="flex items-start gap-2.5 pb-3 border-b border-slate-100">
            <MapPin className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 font-bold uppercase text-[10px]">Pick-up</p>
              <p className="text-slate-900 font-bold truncate">{pickupLocation.name}</p>
              {pickupSurcharge > 0 && (
                <p className="text-orange-600 font-bold mt-0.5">+{formatUSD(pickupSurcharge)} surcharge</p>
              )}
            </div>
          </div>
        )}

        {/* Duration pill */}
        {duration.count > 0 && (
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span className="text-slate-900 font-bold">Duration</span>
            </div>
            <span className="px-2.5 py-1 bg-orange-100 text-orange-900 font-extrabold rounded-full">
              {duration.label}
            </span>
          </div>
        )}

        {/* Items */}
        {selectedTiers.length > 0 && (
          <div className="flex flex-col gap-2 pb-3 border-b border-slate-100">
            <p className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-orange-600" /> Stored Items
            </p>
            {selectedTiers.map((tier) => {
              const qty       = quantities[tier.id] ?? 0;
              const days      = Math.max(1, duration.count || 1);
              const rate      = days > 7 ? tier.rate_weekly_usd : tier.rate_daily_usd;
              const lineTotal = rate * qty * days;
              return (
                <div key={tier.id} className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">{qty}× {tier.name}</span>
                  <span className="font-extrabold text-slate-900">{formatUSD(lineTotal)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Airport Service */}
        {airportServiceFee > 0 && (
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-orange-600" /> Airport Delivery Service
            </span>
            <span className="font-extrabold text-slate-900">+{formatUSD(airportServiceFee)}</span>
          </div>
        )}

        {/* Insurance */}
        {insuranceEnabled && insuranceFee > 0 && (
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Insurance Add-on
            </span>
            <span className="font-extrabold text-emerald-700">+{formatUSD(insuranceFee)}</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="pt-2">
          <div className="flex justify-between items-baseline">
            <span className="text-base font-black text-[#1C130E]">Total</span>
            <div className="text-right">
              <p className="text-3xl font-black text-orange-600">{formatUSD(grandTotal)}</p>
              <p className="text-xs font-bold text-slate-500 mt-0.5">{formatLKR(grandTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <span>Free cancellation up to 2 hours before drop-off</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Optional Insurance Add-on available</span>
        </div>
      </div>
    </div>
  );
}
