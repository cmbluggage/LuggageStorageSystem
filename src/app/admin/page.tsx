'use client';

import React, { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatUSD } from '@/lib/currency';
import { ToastContainer, type ToastMessage } from '@/components/ui/Toast';
import { SettingsPanel } from '@/components/admin/SettingsPanel';
import { CatalogEditor, type FieldDef } from '@/components/admin/CatalogEditor';
import { TimeSlotsPanel } from '@/components/admin/TimeSlotsPanel';
import { BookingsPanel } from '@/components/admin/BookingsPanel';
import { AuditPanel } from '@/components/admin/AuditPanel';
import { itemTiersApi, locationsApi, addonsApi } from '@/lib/admin/api';
import type { ItemTierRow, LocationRow, AddonRow } from '@/lib/supabase/types';
import {
  Luggage, MapPin, Plane, Clock, LogOut, ShieldCheck,
  SlidersHorizontal, ClipboardList, ScrollText, Menu, X,
} from 'lucide-react';

/**
 * SuperAdmin control panel.
 *
 * Rebuilt from a 1888-line monolith that wrote to Supabase directly from
 * the browser (only possible because RLS was open) and kept several values
 * — item artwork, insurance behaviour, the 7-day threshold — hardcoded in
 * the client. Each tab is now its own component talking to an authenticated
 * API, and every business value is editable under Settings.
 */

type AdminTab = 'bookings' | 'item-tiers' | 'addons' | 'locations' | 'time-slots' | 'settings' | 'audit-log';

/**
 * Grouped the way a business owner actually thinks about the operation,
 * not by which table a tab happens to write to. Bookings is what you check
 * first each day, so it leads; the old flat "Configure" bucket lumped
 * pricing, locations and global rules together with no distinction.
 */
const TABS: { id: AdminTab; label: string; icon: React.ReactNode; group: string }[] = [
  { id: 'bookings',   label: 'Bookings',          icon: <ClipboardList className="w-4 h-4" />,    group: 'Day to day' },
  { id: 'item-tiers', label: 'Item Tiers',        icon: <Luggage className="w-4 h-4" />,          group: 'Pricing & Catalog' },
  { id: 'addons',     label: 'Add-on Services',   icon: <Plane className="w-4 h-4" />,            group: 'Pricing & Catalog' },
  { id: 'locations',  label: 'Locations',         icon: <MapPin className="w-4 h-4" />,           group: 'Locations & Schedule' },
  { id: 'time-slots', label: 'Operating Hours',   icon: <Clock className="w-4 h-4" />,            group: 'Locations & Schedule' },
  { id: 'settings',   label: 'Business Settings', icon: <SlidersHorizontal className="w-4 h-4" />, group: 'Business Rules' },
  { id: 'audit-log',  label: 'Audit Log',         icon: <ScrollText className="w-4 h-4" />,       group: 'Records' },
];

// ── Field definitions per catalog ───────────────────────────────

const TIER_FIELDS: FieldDef<ItemTierRow>[] = [
  { key: 'code', label: 'Code', type: 'text', createOnly: true, placeholder: 'ITEM_006', hint: 'Uppercase, permanent.' },
  { key: 'name', label: 'Display name', type: 'text', placeholder: 'Medium / Large Bag' },
  { key: 'description', label: 'Description', type: 'text', wide: true, placeholder: 'Shown under the item name' },
  { key: 'supported_items', label: 'What fits', type: 'text', wide: true, placeholder: 'Carry-on suitcases, backpacks…' },
  { key: 'weight_spec', label: 'Size / weight limit', type: 'text', placeholder: 'Max height 75 cm, max 30 kg' },
  { key: 'icon_emoji', label: 'Icon', type: 'text', placeholder: '🧳' },
  { key: 'image_url', label: 'Image path or URL', type: 'text', wide: true, placeholder: '/items/carry_on.png' },
  { key: 'rate_daily_usd', label: 'Day rate', type: 'money', min: 0, hint: 'Charged per item, per day.' },
  { key: 'rate_weekly_usd', label: 'Long-stay day rate', type: 'money', min: 0, hint: 'Applies to all days past the threshold.' },
  { key: 'insurance_fee_usd', label: 'Insurance fee', type: 'money', min: 0, hint: 'Flat, per item, once per booking.' },
  { key: 'display_order', label: 'Sort order', type: 'number', min: 0 },
];

const LOCATION_FIELDS: FieldDef<LocationRow>[] = [
  { key: 'code', label: 'Code', type: 'text', createOnly: true, placeholder: 'LOC_003', hint: 'Uppercase, permanent.' },
  { key: 'name', label: 'Display name', type: 'text', placeholder: 'Hotel Thilon Drop Point' },
  { key: 'dropoff_surcharge_usd', label: 'Drop-off surcharge', type: 'money', min: 0 },
  { key: 'pickup_surcharge_usd', label: 'Pick-up surcharge', type: 'money', min: 0 },
  {
    key: 'is_airport',
    label: 'Airport location',
    type: 'toggle',
    wide: true,
    hint: 'Forces card payment. Cash is hidden from customers for any booking touching this site.',
  },
  {
    key: 'requires_stripe',
    label: 'Card payment required',
    type: 'toggle',
    wide: true,
    hint: 'Same effect as the airport flag, for non-airport sites that cannot handle cash.',
  },
  { key: 'allows_cash', label: 'Accepts cash', type: 'toggle', wide: true, hint: 'Turn off to make this site card-only.' },
];

const ADDON_FIELDS: FieldDef<AddonRow>[] = [
  { key: 'code', label: 'Code', type: 'text', createOnly: true, placeholder: 'ADDON_003', hint: 'Uppercase, permanent.' },
  { key: 'name', label: 'Display name', type: 'text', placeholder: 'Express Priority Handling' },
  { key: 'description', label: 'Description', type: 'text', wide: true },
  { key: 'fee_usd', label: 'Fee', type: 'money', min: 0 },
];

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('bookings');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [navOpen, setNavOpen] = useState(false);

  const notify = useCallback((title: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // ToastContainer dismisses on its own timer; no cleanup needed here.
    setToasts((t) => [...t, { id, title, type: 'success' }]);
  }, []);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  const select = (id: AdminTab) => {
    setTab(id);
    setNavOpen(false);
  };

  const groups = [...new Set(TABS.map((t) => t.group))];

  return (
    <div className="admin-shell min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-[#1C130E] text-white sticky top-0 z-40 border-b border-stone-800 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setNavOpen((o) => !o)}
              aria-label="Toggle navigation"
              aria-expanded={navOpen}
              className="lg:hidden p-2 -ml-2 rounded-xl text-stone-300 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="w-7 h-7 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Luggage Storage Colombo</span>
              <p className="text-sm font-extrabold text-white leading-none truncate">Control Panel</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            id="admin-logout-btn"
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs font-bold text-stone-300
                       hover:bg-stone-800 hover:text-white transition-all cursor-pointer flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex gap-8 px-4 sm:px-6 py-6 sm:py-8">
        <nav
          aria-label="Admin sections"
          className={[
            'flex-shrink-0 w-full lg:w-56',
            navOpen ? 'block' : 'hidden lg:block',
            navOpen ? 'fixed inset-x-0 top-[57px] bottom-0 z-30 bg-slate-50 p-4 overflow-y-auto lg:static lg:p-0' : '',
          ].join(' ')}
        >
          <div className="lg:sticky lg:top-24 flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-3">{group}</p>
                <ul className="flex flex-col gap-0.5">
                  {TABS.filter((t) => t.group === group).map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => select(item.id)}
                        aria-current={tab === item.id ? 'page' : undefined}
                        className={[
                          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold',
                          'transition-all cursor-pointer text-left',
                          tab === item.id
                            ? 'bg-[#1C130E] text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900',
                        ].join(' ')}
                      >
                        <span className={tab === item.id ? 'text-orange-400' : 'text-slate-400'}>{item.icon}</span>
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="flex-1 min-w-0" id="admin-main">
          {tab === 'settings' && <SettingsPanel onNotify={notify} />}

          {tab === 'item-tiers' && (
            <CatalogEditor<ItemTierRow>
              title="Item Tiers"
              description="What customers can store and what each type costs. Rates here feed the pricing engine directly."
              noun="item tier"
              api={itemTiersApi}
              fields={TIER_FIELDS}
              blank={BLANK_TIER}
              renderTitle={(r) => (
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{r.icon_emoji}</span>
                  {r.name}
                  <span className="font-mono text-[11px] text-slate-400">{r.code}</span>
                </span>
              )}
              renderSummary={(r) => (
                <>
                  {formatUSD(r.rate_daily_usd)}/day · {formatUSD(r.rate_weekly_usd)}/day long-stay · insurance{' '}
                  {formatUSD(r.insurance_fee_usd)}
                </>
              )}
              onNotify={notify}
            />
          )}

          {tab === 'locations' && (
            <CatalogEditor<LocationRow>
              title="Locations"
              description="Drop-off and pick-up sites. The airport and card-only flags decide whether cash is offered at checkout."
              noun="location"
              api={locationsApi}
              fields={LOCATION_FIELDS}
              blank={BLANK_LOCATION}
              renderTitle={(r) => (
                <span className="flex items-center gap-2">
                  {r.name}
                  <span className="font-mono text-[11px] text-slate-400">{r.code}</span>
                  {(r.is_airport || r.requires_stripe || !r.allows_cash) && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-[#1C130E] text-orange-400">
                      Card only
                    </span>
                  )}
                </span>
              )}
              renderSummary={(r) => (
                <>
                  Drop-off {formatUSD(r.dropoff_surcharge_usd)} · Pick-up {formatUSD(r.pickup_surcharge_usd)}
                </>
              )}
              onNotify={notify}
            />
          )}

          {tab === 'addons' && (
            <CatalogEditor<AddonRow>
              title="Add-on Services"
              description="Optional extras offered alongside storage."
              noun="add-on service"
              api={addonsApi}
              fields={ADDON_FIELDS}
              blank={BLANK_ADDON}
              renderTitle={(r) => (
                <span className="flex items-center gap-2">
                  {r.name}
                  <span className="font-mono text-[11px] text-slate-400">{r.code}</span>
                </span>
              )}
              renderSummary={(r) => <>{formatUSD(r.fee_usd)} · {r.description || 'No description'}</>}
              onNotify={notify}
            />
          )}

          {tab === 'time-slots' && <TimeSlotsPanel onNotify={notify} />}
          {tab === 'bookings' && <BookingsPanel />}
          {tab === 'audit-log' && <AuditPanel />}
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

// ── Blank rows for the create forms ─────────────────────────────

const BLANK_TIER: Omit<ItemTierRow, 'id'> = {
  code: '',
  name: '',
  description: '',
  supported_items: '',
  weight_spec: '',
  icon_emoji: '🧳',
  image_url: '',
  rate_daily_usd: 0,
  rate_weekly_usd: 0,
  insurance_fee_usd: 0,
  is_active: true,
  display_order: 0,
  created_at: '',
  updated_at: '',
};

const BLANK_LOCATION: Omit<LocationRow, 'id'> = {
  code: '',
  name: '',
  is_airport: false,
  dropoff_surcharge_usd: 0,
  pickup_surcharge_usd: 0,
  requires_stripe: false,
  allows_cash: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

const BLANK_ADDON: Omit<AddonRow, 'id'> = {
  code: '',
  name: '',
  description: '',
  fee_usd: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
};
