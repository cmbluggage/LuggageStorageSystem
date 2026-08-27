-- ================================================================
-- STOWAWAY — Safe Idempotent Production Seed Data
-- Run AFTER migrations 001 and 002.
-- ================================================================

-- ── Locations ─────────────────────────────────────────────────
insert into public.locations
  (name, code, is_airport, dropoff_surcharge_usd, pickup_surcharge_usd, requires_stripe, allows_cash)
values
  ('CMB Airport Storage Hub',      'LOC_001', true,  10.00, 10.00, true,  false),
  ('Hotel Thilon Drop Point',       'LOC_002', false,  0.00,  0.00, false, true)
on conflict (code) do update set
  is_airport            = excluded.is_airport,
  dropoff_surcharge_usd = excluded.dropoff_surcharge_usd,
  pickup_surcharge_usd  = excluded.pickup_surcharge_usd,
  requires_stripe       = excluded.requires_stripe,
  allows_cash           = excluded.allows_cash;

-- Deactivate LOC_003 if previously seeded
update public.locations set is_active = false where code = 'LOC_003';

-- ── Time Slots (window = 2h operational block) ─────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'time_slots_label_key'
  ) then
    alter table public.time_slots add constraint time_slots_label_key unique (label);
  end if;
exception
  when others then null;
end $$;

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '08:00 AM - 10:00 AM', '08:00', '10:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '08:00 AM - 10:00 AM');

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '10:00 AM - 12:00 PM', '10:00', '12:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '10:00 AM - 12:00 PM');

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '12:00 PM - 02:00 PM', '12:00', '14:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '12:00 PM - 02:00 PM');

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '02:00 PM - 04:00 PM', '14:00', '16:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '02:00 PM - 04:00 PM');

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '04:00 PM - 06:00 PM', '16:00', '18:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '04:00 PM - 06:00 PM');

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '06:00 PM - 08:00 PM', '18:00', '20:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '06:00 PM - 08:00 PM');

insert into public.time_slots (label, start_time, end_time, slot_type, day_of_week, is_active)
select '08:00 PM - 10:00 PM', '20:00', '22:00', 'window', 'all', true
where not exists (select 1 from public.time_slots where label = '08:00 PM - 10:00 PM');

-- Update existing slots if they were inserted previously
update public.time_slots set slot_type = 'window' where slot_type is null or slot_type = '';

-- ── Item Tiers ────────────────────────────────────────────────
-- rate_daily_usd    = per-day rate for days 1–7
-- rate_weekly_usd   = per-day rate for day 8+ (ALL days billed at this rate once threshold crossed)
-- insurance_fee_usd = flat fee per item when customer opts into insurance

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

insert into public.item_tiers
  (code, name, description, supported_items, weight_spec, icon_emoji,
   rate_daily_usd, rate_weekly_usd, insurance_fee_usd, display_order)
values
  ('ITEM_001', 'Small Bag / Documents',
   'Laptops, handbags, document files, small carry-on items',
   'Laptop, handbag, document files, small carry-on',
   'Max height 55 cm', '💼',
   3.00, 2.40, 2.40, 1),

  ('ITEM_002', 'Medium / Large Bag',
   'Standard carry-on suitcases, backpacks, trolleys',
   'Carry-on suitcases, backpacks, trolleys',
   'Max height 75 cm, max 30 kg', '🧳',
   4.00, 3.20, 2.40, 2),

  ('ITEM_003', 'XL Suitcase',
   'Extra-large luggage, heavy check-in suitcases',
   'Extra-large luggage, heavy check-in suitcases',
   'Max height 85 cm, max 40 kg', '🗃️',
   5.00, 4.00, 2.40, 3),

  ('ITEM_004', 'Odd-Sized Items',
   'Foldable bicycles, golf bags, baby car seats, surfboards',
   'Foldable bicycles, golf bags, baby car seats, surfboards',
   'Non-standard dimensions', '🚲',
   7.00, 5.50, 2.40, 4)
on conflict (code) do update set
  name              = excluded.name,
  description       = excluded.description,
  supported_items   = excluded.supported_items,
  weight_spec       = excluded.weight_spec,
  rate_daily_usd    = excluded.rate_daily_usd,
  rate_weekly_usd   = excluded.rate_weekly_usd,
  insurance_fee_usd = excluded.insurance_fee_usd,
  display_order     = excluded.display_order;

-- Deactivate ITEM_005 (Tea Chest Box) if previously seeded
update public.item_tiers set is_active = false where code = 'ITEM_005';

-- ── Add-On Services ───────────────────────────────────────────
insert into public.addon_services
  (code, name, description, fee_usd)
values
  ('ADDON_001', 'Airport Delivery Service',
   'Direct luggage collection or delivery at Colombo Airport terminal',
   10.00)
on conflict (code) do update set
  fee_usd = excluded.fee_usd;

-- ── Seed Customers ─────────────────────────────────────────────
insert into public.customers
  (phone, full_name, email, passport_number)
values
  ('+94 77 555 1234', 'Pasan Dhanushka', 'pasan@stowaway.lk',       'N9876543'),
  ('+1 415 555 0199', 'Alex Rivera',     'alex.rivera@gmail.com',    'A4829105'),
  ('+81 90 1234 5678','Sophia Tanaka',   'sophia.tanaka@japan.jp',   'TK901234')
on conflict (phone) do nothing;

-- ── Seed Staff & SuperAdmin Auth Users ─────────────────────────
create extension if not exists pgcrypto;

-- 1. Admin User
insert into auth.users
  (id, instance_id, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'admin@stowaway.lk',
  crypt('StowawayAdmin2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"role":"superadmin"}'::jsonb,
  '{"full_name":"Operations Director","role":"superadmin"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
where not exists (select 1 from auth.users where email = 'admin@stowaway.lk');

update auth.users
set encrypted_password = crypt('StowawayAdmin2026!', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data  = '{"provider":"email","providers":["email"],"role":"superadmin"}'::jsonb,
    raw_user_meta_data = '{"full_name":"Operations Director","role":"superadmin"}'::jsonb,
    updated_at         = now()
where email = 'admin@stowaway.lk';

-- 2. Staff User
insert into auth.users
  (id, instance_id, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
select
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'staff@stowaway.lk',
  crypt('StowawayStaff2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"role":"staff"}'::jsonb,
  '{"full_name":"CMB Airport Operational Staff","role":"staff"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
where not exists (select 1 from auth.users where email = 'staff@stowaway.lk');

update auth.users
set encrypted_password = crypt('StowawayStaff2026!', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data  = '{"provider":"email","providers":["email"],"role":"staff"}'::jsonb,
    raw_user_meta_data = '{"full_name":"CMB Airport Operational Staff","role":"staff"}'::jsonb,
    updated_at         = now()
where email = 'staff@stowaway.lk';

insert into public.staff (user_id, role, full_name)
select u.id, 'superadmin', 'Operations Director (SuperAdmin)'
from auth.users u where u.email = 'admin@stowaway.lk'
on conflict (user_id) do nothing;

insert into public.staff (user_id, role, full_name)
select u.id, 'staff', 'CMB Airport Operational Staff'
from auth.users u where u.email = 'staff@stowaway.lk'
on conflict (user_id) do nothing;

-- ── Auth Identities (required for signInWithPassword) ──────────
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(), now(), now()
from auth.users u
where u.email in ('admin@stowaway.lk', 'staff@stowaway.lk')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- ── Seed Demo Bookings ─────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'base_total_usd') then
    alter table public.bookings alter column base_total_usd drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'addon_total_usd') then
    alter table public.bookings alter column addon_total_usd drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'duration_type') then
    alter table public.bookings alter column duration_type drop not null;
  end if;
end $$;

insert into public.bookings
  (customer_id, dropoff_location_id, pickup_location_id,
   duration_unit, duration_value,
   storage_start_date, storage_end_date,
   item_total_usd, dropoff_surcharge_usd, pickup_surcharge_usd,
   insurance_total_usd, grand_total_usd,
   payment_method, payment_status, booking_status, flight_number, notes)
select
  c.id, l1.id, l2.id,
  'days', 2,
  '2026-07-27'::date, '2026-07-29'::date,
  18.00, 10.00, 0.00,
  4.80, 32.80,
  'stripe_simulated', 'paid', 'confirmed',
  'UL 504', null
from public.customers c, public.locations l1, public.locations l2
where c.phone = '+94 77 555 1234'
  and l1.code = 'LOC_001'
  and l2.code = 'LOC_002';

insert into public.bookings
  (customer_id, dropoff_location_id, pickup_location_id,
   duration_unit, duration_value,
   storage_start_date, storage_end_date,
   item_total_usd, dropoff_surcharge_usd, pickup_surcharge_usd,
   insurance_total_usd, grand_total_usd,
   payment_method, payment_status, booking_status, flight_number, notes)
select
  c.id, l1.id, l2.id,
  'days', 3,
  '2026-07-26'::date, '2026-07-29'::date,
  36.00, 0.00, 10.00,
  0.00, 46.00,
  'cash', 'pending', 'deposited',
  null, 'Surfboard & carry-on bag storage'
from public.customers c, public.locations l1, public.locations l2
where c.phone = '+1 415 555 0199'
  and l1.code = 'LOC_002'
  and l2.code = 'LOC_001';
