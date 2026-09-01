-- ================================================================
-- STOWAWAY — Consolidated Database Schema
-- Generated from supabase/migrations/001..007, in order, unmodified.
--
-- WHAT THIS IS
-- Every table, trigger, index, and RLS policy the app needs, in one
-- file, so a brand-new Supabase project can be stood up with a single
-- paste into the SQL Editor instead of running 7 files back to back.
-- This is a straight concatenation of the existing migration files —
-- nothing was rewritten — so it produces exactly the same end state
-- as running 001 through 007 individually. Safe to run on a fresh
-- database. Do NOT run this against a database that already ran the
-- individual migrations — it's idempotent (IF NOT EXISTS / IF EXISTS
-- guards throughout) so re-running is harmless, but there's no reason
-- to.
--
-- EXCLUDED ON PURPOSE (see AGENTS.md > Database Schema for why):
--   - supabase/fix_admin_rls.sql   — re-opened public/authenticated
--     write access that migration 004 deliberately locked down.
--     Nothing in the app's client code queries Supabase directly
--     (verified: every table read/write goes through src/lib/db.ts on
--     the server using the service-role key), so this patch served no
--     functional purpose and was pure attack surface. Do not re-add
--     it without a specific reason, and if you do, scope it far
--     narrower than "any authenticated user can do anything."
--   - supabase/fix_auth_passwords.sql — superseded by
--     seed_accounts.sql (this consolidation), which does the same
--     auth.users + auth.identities fix, correctly and idempotently.
--
-- AFTER THIS FILE, run in order:
--   1. seed_catalog.sql   (required — locations/pricing/time slots)
--   2. seed_accounts.sql  (required — your admin/staff login)
--   3. seed_demo_data.sql (optional — fake customers/bookings, dev only)
-- ================================================================


-- ================================================================
-- Migration 001 — Initial schema
-- ================================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Locations ─────────────────────────────────────────────────
create table if not exists public.locations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  code                  text not null unique,
  is_airport            boolean not null default false,
  dropoff_surcharge_usd numeric(10,2) not null default 0,
  pickup_surcharge_usd  numeric(10,2) not null default 0,
  requires_stripe       boolean not null default false,
  allows_cash           boolean not null default true,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Time Slots ────────────────────────────────────────────────
-- slot_type: 'window' = 2-hour operational block, 'hourly' = 1-hour precision slot
create table if not exists public.time_slots (
  id            uuid primary key default gen_random_uuid(),
  label         text not null unique,
  start_time    text not null,
  end_time      text not null,
  slot_type     text not null default 'window' check (slot_type in ('window', 'hourly')),
  day_of_week   text not null default 'all',  -- 'all' | '0' (Sun) | '1' (Mon) … | '6' (Sat)
  specific_date date,                          -- date override, null = recurring
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── Item Tiers ────────────────────────────────────────────────
-- rate_daily_usd      : standard per-day rate (days 1-7)
-- rate_weekly_usd     : reduced per-day rate applied to ALL days when booking > 7 days
-- insurance_fee_usd   : flat fee per item per booking when customer opts into insurance
create table if not exists public.item_tiers (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  description       text not null,
  supported_items   text not null,
  weight_spec       text,
  icon_emoji        text not null default '🧳',
  rate_daily_usd    numeric(10,2) not null,
  rate_weekly_usd   numeric(10,2) not null,  -- "Day Rate (After 7 Days)"
  insurance_fee_usd numeric(10,2) not null default 0,
  is_active         boolean not null default true,
  display_order     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Add-On Services ───────────────────────────────────────────
create table if not exists public.addon_services (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,
  fee_usd     numeric(10,2) not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Customers ─────────────────────────────────────────────────
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique,
  full_name       text,
  email           text,
  passport_number text,
  otp_code        text,
  otp_expires_at  timestamptz,
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ── Bookings ──────────────────────────────────────────────────
-- duration_unit: 'hours' | 'days'  (same-day = hours, multi-day = days)
-- insurance_total_usd: Σ(qty × tier.insurance_fee_usd) when customer opts in; 0 otherwise
-- airport_service_usd: auto-derived from location is_airport flag (addon fee or 0)
create table if not exists public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customers(id) on delete cascade,
  dropoff_location_id   uuid not null references public.locations(id),
  pickup_location_id    uuid not null references public.locations(id),
  duration_unit         text not null default 'days' check (duration_unit in ('hours', 'days')),
  duration_value        integer not null check (duration_value > 0),
  dropoff_time          text,
  pickup_time           text,
  storage_start_date    date not null,
  storage_end_date      date not null,
  item_total_usd        numeric(10,2) not null default 0,
  dropoff_surcharge_usd numeric(10,2) not null default 0,
  pickup_surcharge_usd  numeric(10,2) not null default 0,
  airport_service_usd   numeric(10,2) not null default 0,
  insurance_total_usd   numeric(10,2) not null default 0,
  grand_total_usd       numeric(10,2) not null default 0,
  payment_method        text not null check (payment_method in ('cash', 'stripe_simulated')),
  payment_status        text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  booking_status        text not null default 'confirmed' check (booking_status in ('confirmed', 'in_transit', 'deposited', 'picked_up', 'cancelled')),
  qr_code_token         text not null default gen_random_uuid()::text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Booking Items ─────────────────────────────────────────────
create table if not exists public.booking_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  tier_id        uuid not null references public.item_tiers(id),
  quantity       integer not null check (quantity > 0),
  unit_rate_usd  numeric(10,2) not null,
  line_total_usd numeric(10,2) not null
);

-- ── Booking Add-Ons ───────────────────────────────────────────
create table if not exists public.booking_addons (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  addon_id   uuid not null references public.addon_services(id),
  fee_usd    numeric(10,2) not null
);

-- ── Staff ─────────────────────────────────────────────────────
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  role       text not null default 'staff' check (role in ('staff', 'superadmin')),
  full_name  text not null,
  created_at timestamptz not null default now()
);

-- ── Audit Log ─────────────────────────────────────────────────
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id  text not null,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id   uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

-- ── Updated_at trigger ────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_locations on public.locations;
create trigger set_updated_at_locations
  before update on public.locations
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_item_tiers on public.item_tiers;
create trigger set_updated_at_item_tiers
  before update on public.item_tiers
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_addon_services on public.addon_services;
create trigger set_updated_at_addon_services
  before update on public.addon_services
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_bookings on public.bookings;
create trigger set_updated_at_bookings
  before update on public.bookings
  for each row execute function public.handle_updated_at();

-- ── Row Level Security ────────────────────────────────────────
alter table public.locations       enable row level security;
alter table public.time_slots      enable row level security;
alter table public.item_tiers      enable row level security;
alter table public.addon_services  enable row level security;
alter table public.customers       enable row level security;
alter table public.bookings        enable row level security;
alter table public.booking_items   enable row level security;
alter table public.booking_addons  enable row level security;
alter table public.staff           enable row level security;
alter table public.audit_log       enable row level security;

-- Public read policies (idempotent with drop if exists)
drop policy if exists "Public can read locations" on public.locations;
create policy "Public can read locations" on public.locations for select using (true);

drop policy if exists "Public can read time_slots" on public.time_slots;
create policy "Public can read time_slots" on public.time_slots for select using (true);

drop policy if exists "Public can read item_tiers" on public.item_tiers;
create policy "Public can read item_tiers" on public.item_tiers for select using (true);

drop policy if exists "Public can read addon_services" on public.addon_services;
create policy "Public can read addon_services" on public.addon_services for select using (true);

-- Staff RLS policy
drop policy if exists "Staff can read their own profile" on public.staff;
create policy "Staff can read their own profile" on public.staff for select using (auth.uid() = user_id or true);


-- ================================================================
-- Migration 002 — Insurance, hourly slots, explicit pricing columns
-- ================================================================

-- ── locations: add is_airport flag ───────────────────────────
alter table public.locations
  add column if not exists is_airport boolean not null default false;

-- Mark CMB Airport
update public.locations set is_airport = true where code = 'LOC_001';

-- ── time_slots: add slot_type & scheduling columns ───────────
alter table public.time_slots
  add column if not exists slot_type   text not null default 'window'
    check (slot_type in ('window', 'hourly')),
  add column if not exists day_of_week text not null default 'all',
  add column if not exists specific_date date;

-- ── item_tiers: add per-item insurance fee & drop rate_monthly_usd constraint ────
alter table public.item_tiers
  add column if not exists insurance_fee_usd numeric(10,2) not null default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'item_tiers'
      and column_name = 'rate_monthly_usd'
  ) then
    alter table public.item_tiers alter column rate_monthly_usd drop not null;
  end if;
end $$;

-- Seed insurance prices (2.40 for all existing tiers)
update public.item_tiers set insurance_fee_usd = 2.40 where insurance_fee_usd = 0;

-- ── item_tiers: update rates to match notebook ───────────────
update public.item_tiers set rate_daily_usd = 3.00, rate_weekly_usd = 2.40 where code = 'ITEM_001';
update public.item_tiers set rate_daily_usd = 4.00, rate_weekly_usd = 3.20 where code = 'ITEM_002';
update public.item_tiers set rate_daily_usd = 5.00, rate_weekly_usd = 4.00 where code = 'ITEM_003';
update public.item_tiers set rate_daily_usd = 7.00, rate_weekly_usd = 5.50 where code = 'ITEM_004';
update public.item_tiers set rate_daily_usd = 4.00, rate_weekly_usd = 3.20 where code = 'ITEM_005';

-- ── bookings: rename/add pricing columns ─────────────────────
-- Add new explicit columns (replaces opaque base_total_usd + addon_total_usd)
alter table public.bookings
  add column if not exists duration_unit       text not null default 'days'
    check (duration_unit in ('hours', 'days')),
  add column if not exists item_total_usd      numeric(10,2) not null default 0,
  add column if not exists airport_service_usd numeric(10,2) not null default 0,
  add column if not exists insurance_total_usd numeric(10,2) not null default 0;

-- Migrate existing data: item_total_usd from base_total_usd if it exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'base_total_usd'
  ) then
    update public.bookings set item_total_usd = base_total_usd where item_total_usd = 0;
    update public.bookings set airport_service_usd = addon_total_usd where airport_service_usd = 0;
  end if;
end;
$$;


-- ================================================================
-- Migration 003 — Public inserts (superseded by 004's lockdown below;
-- kept for historical fidelity since 004 explicitly drops these policies)
-- ================================================================

-- Customers
drop policy if exists "Public can insert customers" on public.customers;
create policy "Public can insert customers" on public.customers for insert with check (true);

drop policy if exists "Public can update customers" on public.customers;
create policy "Public can update customers" on public.customers for update using (true);

-- Bookings
drop policy if exists "Public can insert bookings" on public.bookings;
create policy "Public can insert bookings" on public.bookings for insert with check (true);

drop policy if exists "Public can update bookings" on public.bookings;
create policy "Public can update bookings" on public.bookings for update using (true);

-- Booking Items
drop policy if exists "Public can insert booking_items" on public.booking_items;
create policy "Public can insert booking_items" on public.booking_items for insert with check (true);

-- Booking Addons
drop policy if exists "Public can insert booking_addons" on public.booking_addons;
create policy "Public can insert booking_addons" on public.booking_addons for insert with check (true);


-- ================================================================
-- Migration 004 — Security lockdown + dynamic app settings + ops indexes
--
-- Migration 003 granted the anon role blanket INSERT/UPDATE on
-- bookings, customers, booking_items and booking_addons. Because the
-- anon key ships to the browser, anyone could flip payment_status to
-- 'paid', rewrite another customer's PII, or edit pricing. From here
-- on, ALL writes go through Next.js route handlers using the
-- service-role key, which bypasses RLS by design. The anon role keeps
-- read access to the public catalog only.
-- ================================================================

-- ── App Settings (dynamic, admin-editable configuration) ──────
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  value_type  text not null default 'number'
                check (value_type in ('number', 'boolean', 'string', 'json')),
  label       text not null,
  description text,
  category    text not null default 'general',
  min_value   numeric,
  max_value   numeric,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

drop trigger if exists set_updated_at_app_settings on public.app_settings;
create trigger set_updated_at_app_settings
  before update on public.app_settings
  for each row execute function public.handle_updated_at();

-- Seed defaults. `on conflict do nothing` keeps operator overrides.
insert into public.app_settings (key, value, value_type, label, description, category, min_value, max_value) values
  ('insurance_enabled',        'true',  'boolean', 'Insurance Available',        'Master switch. When off, the insurance step is hidden from customers and never billed.', 'insurance', null, null),
  ('insurance_default_on',     'false', 'boolean', 'Insurance Pre-selected',     'Whether the insurance toggle starts enabled in the booking flow.',                      'insurance', null, null),
  ('insurance_label',          '"Damage & Loss Protection"', 'string', 'Insurance Display Name', 'Customer-facing name for the insurance product.',                      'insurance', null, null),
  ('week_threshold_days',      '7',     'number',  'Long-stay Threshold (days)', 'Bookings longer than this use each tier''s discounted long-stay day rate for ALL days.', 'pricing', 1, 365),
  ('airport_service_fee_usd',  '5.00',  'number',  'Airport Handling Fee (USD)', 'Flat fee applied when either leg of the booking is an airport location.',                'pricing', 0, 1000),
  ('min_booking_days',         '1',     'number',  'Minimum Billable Days',      'Floor applied to every booking duration.',                                              'pricing', 1, 365),
  ('max_booking_days',         '90',    'number',  'Maximum Booking Length',     'Bookings longer than this are rejected.',                                               'pricing', 1, 3650),
  ('max_items_per_booking',    '20',    'number',  'Max Items Per Booking',      'Total quantity across all tiers allowed in a single booking.',                          'limits',  1, 500),
  ('max_qty_per_tier',         '10',    'number',  'Max Quantity Per Tier',      'Maximum units of any single item tier in one booking.',                                 'limits',  1, 100),
  ('booking_lead_time_hours',  '0',     'number',  'Minimum Lead Time (hours)',  'How far in advance a drop-off must be booked. 0 allows immediate bookings.',            'limits',  0, 720),
  ('booking_horizon_days',     '365',   'number',  'Booking Horizon (days)',     'How far into the future a drop-off may be scheduled.',                                  'limits',  1, 3650),
  ('usd_to_lkr_rate',          '320',   'number',  'USD to LKR Fallback Rate',   'Used when the live exchange-rate feed is unavailable.',                                 'currency', 1, 100000),
  ('exchange_rate_live',       'true',  'boolean', 'Use Live Exchange Rate',     'Fetch the USD/LKR rate from the live feed. When off, the fallback rate above is used.',  'currency', null, null),
  ('support_phone',            '"+94770000000"', 'string', 'Support Phone',      'Shown to customers and used for the click-to-call action.',                             'support', null, null),
  ('support_whatsapp',         '"+94770000000"', 'string', 'Support WhatsApp',   'Number behind the WhatsApp support button.',                                            'support', null, null),
  ('turnstile_enabled',        'false', 'boolean', 'Cloudflare Turnstile',       'Require a Turnstile challenge on booking creation. Needs the Turnstile env vars set.',   'security', null, null),
  ('booking_rate_limit',       '10',    'number',  'Bookings Per IP / Hour',     'Rate limit on booking creation per client IP.',                                         'security', 1, 1000),
  ('ops_window_hours',         '48',    'number',  'Operations Window (hours)',  'How far ahead the staff dashboard looks for upcoming drop-offs and pick-ups.',           'operations', 1, 720)
on conflict (key) do nothing;

-- ── Bookings: columns the app was computing but never persisting ──
alter table public.bookings
  add column if not exists insurance_enabled boolean not null default false,
  add column if not exists duration_days     integer,
  add column if not exists cancelled_at      timestamptz,
  add column if not exists cancel_reason     text;

-- Idempotency: lets the booking endpoint dedupe double-submits.
alter table public.bookings
  add column if not exists idempotency_key text;

create unique index if not exists bookings_idempotency_key_uniq
  on public.bookings (idempotency_key)
  where idempotency_key is not null;

-- ── Indexes for the operations dashboard & customer lookup ────
create index if not exists bookings_storage_start_idx  on public.bookings (storage_start_date);
create index if not exists bookings_storage_end_idx    on public.bookings (storage_end_date);
create index if not exists bookings_status_idx         on public.bookings (booking_status);
create index if not exists bookings_dropoff_loc_idx    on public.bookings (dropoff_location_id);
create index if not exists bookings_pickup_loc_idx     on public.bookings (pickup_location_id);
create index if not exists bookings_created_at_idx     on public.bookings (created_at desc);
create index if not exists booking_items_booking_idx   on public.booking_items (booking_id);
create index if not exists booking_addons_booking_idx  on public.booking_addons (booking_id);
create index if not exists customers_phone_idx         on public.customers (phone);
create index if not exists audit_log_created_at_idx    on public.audit_log (created_at desc);
create index if not exists audit_log_table_idx         on public.audit_log (table_name);

-- ── Audit log: record who did it, in a readable form ──────────
alter table public.audit_log
  add column if not exists actor_email text,
  add column if not exists summary     text;

-- ================================================================
-- RLS LOCKDOWN
-- ================================================================
alter table public.app_settings enable row level security;

-- Drop every permissive write policy introduced by 003.
drop policy if exists "Public can insert customers"      on public.customers;
drop policy if exists "Public can update customers"      on public.customers;
drop policy if exists "Public can insert bookings"       on public.bookings;
drop policy if exists "Public can update bookings"       on public.bookings;
drop policy if exists "Public can insert booking_items"  on public.booking_items;
drop policy if exists "Public can insert booking_addons" on public.booking_addons;

-- The old staff policy was `using (auth.uid() = user_id or true)`,
-- i.e. every authenticated user could read the whole staff roster.
drop policy if exists "Staff can read their own profile" on public.staff;
create policy "Staff read own profile" on public.staff
  for select using (auth.uid() = user_id);

-- ── Public (anon) read access: catalog tables only ────────────
drop policy if exists "Public can read locations"      on public.locations;
create policy "Public can read active locations" on public.locations
  for select using (is_active = true);

drop policy if exists "Public can read time_slots"     on public.time_slots;
create policy "Public can read active time_slots" on public.time_slots
  for select using (is_active = true);

drop policy if exists "Public can read item_tiers"     on public.item_tiers;
create policy "Public can read active item_tiers" on public.item_tiers
  for select using (is_active = true);

drop policy if exists "Public can read addon_services" on public.addon_services;
create policy "Public can read active addon_services" on public.addon_services
  for select using (is_active = true);

drop policy if exists "Public can read app_settings"   on public.app_settings;
create policy "Public can read app_settings" on public.app_settings
  for select using (true);

-- No policies are defined for customers, bookings, booking_items,
-- booking_addons or audit_log. With RLS enabled and no policy, anon
-- and authenticated are denied by default. The service-role key used
-- by the server routes bypasses RLS, which is the only write path.

-- Belt and braces: revoke the table grants PostgREST relies on so a
-- future stray policy cannot silently re-open write access.
revoke insert, update, delete on public.locations       from anon, authenticated;
revoke insert, update, delete on public.time_slots      from anon, authenticated;
revoke insert, update, delete on public.item_tiers      from anon, authenticated;
revoke insert, update, delete on public.addon_services  from anon, authenticated;
revoke insert, update, delete on public.app_settings    from anon, authenticated;
revoke insert, update, delete on public.customers       from anon, authenticated;
revoke insert, update, delete on public.bookings        from anon, authenticated;
revoke insert, update, delete on public.booking_items   from anon, authenticated;
revoke insert, update, delete on public.booking_addons  from anon, authenticated;
revoke insert, update, delete on public.staff           from anon, authenticated;
revoke insert, update, delete on public.audit_log       from anon, authenticated;

revoke select on public.customers      from anon, authenticated;
revoke select on public.bookings       from anon, authenticated;
revoke select on public.booking_items  from anon, authenticated;
revoke select on public.booking_addons from anon, authenticated;
revoke select on public.audit_log      from anon, authenticated;


-- ================================================================
-- Migration 005 — Item tier artwork becomes real data
-- ================================================================

alter table public.item_tiers
  add column if not exists image_url text;

-- Backfill the paths the client helper had been hardcoding.
update public.item_tiers set image_url = '/items/small_bag.png'      where code = 'ITEM_001' and image_url is null;
update public.item_tiers set image_url = '/items/carry_on.png'       where code = 'ITEM_002' and image_url is null;
update public.item_tiers set image_url = '/items/large_suitcase.png' where code = 'ITEM_003' and image_url is null;
update public.item_tiers set image_url = '/items/odd_size.png'       where code = 'ITEM_004' and image_url is null;
update public.item_tiers set image_url = '/items/tea_chest.png'      where code = 'ITEM_005' and image_url is null;


-- ================================================================
-- Migration 006 — Remove redundant airport fee; flight number;
-- cash-collection tracking
-- ================================================================

-- ── Remove the redundant global "airport handling fee" ──────────
-- calculateGrandTotal() was charging a flat, admin-configured fee on top
-- of the airport location's own dropoff_surcharge_usd/pickup_surcharge_usd
-- whenever a booking touched an airport — the seeded airport location
-- (LOC_001) already carries a $10 surcharge on both legs, so an
-- airport-to-airport booking was billed the location surcharge for BOTH
-- legs plus a THIRD flat fee for the same thing. Location-level surcharges
-- already cover this per-site, and are the only mechanism now.
delete from public.app_settings where key = 'airport_service_fee_usd';

alter table public.bookings
  drop column if exists airport_service_usd;

-- ── Flight number: a real column, not a repurposed notes field ──
alter table public.bookings
  add column if not exists flight_number text;

-- ── Cash collection tracking ──────────────────────────────────────
alter table public.bookings
  add column if not exists cash_collected_by uuid references public.staff(user_id),
  add column if not exists cash_collected_at timestamptz;

comment on column public.bookings.flight_number is 'Optional arrival flight number entered by the customer at booking time.';
comment on column public.bookings.cash_collected_by is 'staff.user_id of whoever marked this booking''s cash payment as physically collected.';
comment on column public.bookings.cash_collected_at is 'When the cash payment was marked collected. Null for card payments and uncollected cash.';


-- ================================================================
-- Migration 007 — Payments ledger and email log
-- ================================================================

-- ── Payments ledger ────────────────────────────────────────────
-- bookings.payment_status was a binary pending/paid flag, which cannot
-- represent "this booking was extended and now owes more, on top of what
-- was already collected." This table is the source of truth for every
-- money movement (a cash collection or a Stripe charge); bookings.payment_
-- status becomes a derived/cached summary kept in sync by application code,
-- not the authority.
create table if not exists public.payments (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid not null references public.bookings(id) on delete cascade,
  amount_usd              numeric(10,2) not null check (amount_usd > 0),
  method                  text not null check (method in ('cash', 'stripe')),
  status                  text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  -- Set for method = 'stripe'. Unique so a webhook retry cannot double-record a charge.
  stripe_session_id       text unique,
  stripe_payment_intent_id text unique,
  -- Set for method = 'cash'.
  collected_by            uuid references public.staff(user_id),
  created_at              timestamptz not null default now()
);

create index if not exists payments_booking_id_idx on public.payments(booking_id);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- A booking now genuinely can be partially paid (extended past what was
-- already collected), which the original check constraint had no room for.
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'partially_paid', 'paid', 'failed'));

comment on table public.payments is 'Ledger of actual money movements against a booking. Source of truth for balance-due; bookings.payment_status is a derived cache.';

-- ── Email delivery log ───────────────────────────────────────────
create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references public.bookings(id) on delete set null,
  to_email    text not null,
  template    text not null,
  provider    text not null,
  status      text not null check (status in ('sent', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists email_log_booking_id_idx on public.email_log(booking_id);

alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

comment on table public.email_log is 'Delivery record for every transactional email attempt, across whichever provider handled it.';

-- ================================================================
-- END OF CONSOLIDATED SCHEMA
-- Next: run seed_catalog.sql, then seed_accounts.sql,
-- then (optionally, dev only) seed_demo_data.sql.
-- ================================================================
