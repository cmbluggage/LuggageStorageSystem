-- ================================================================
-- STOWAWAY — Catalog Seed (locations, time slots, pricing)
-- Run AFTER schema.sql.
--
-- This is real business configuration, not demo/test data — the app
-- cannot take a booking without at least one location and one item
-- tier. Safe to re-run (every insert is on-conflict-safe or guarded
-- with a not-exists check). Edit the values below to match your
-- actual pricing/locations before running, or run as-is and change
-- everything later through the admin panel (/admin -> Locations,
-- Item Tiers, Add-on Services, Operating Hours) — nothing here is
-- one-time-only.
-- ================================================================

-- ── Locations ─────────────────────────────────────────────────
-- dropoff_display_name / pickup_display_name are what the booking flow's
-- location picker shows for each direction (falls back to `name` when
-- null) — the same physical site can read differently depending on
-- whether the customer is choosing where to drop off or pick up.
insert into public.locations
  (name, code, is_airport, dropoff_surcharge_usd, pickup_surcharge_usd, requires_stripe, allows_cash, dropoff_display_name, pickup_display_name)
values
  ('CMB Airport Storage Hub',      'LOC_001', true,  10.00, 10.00, true,  false, 'CMB Airport Drop Off Location',   'CMB Airport Pickup Location'),
  ('Hotel Thilon Drop Point',       'LOC_002', false,  0.00,  0.00, false, true,  'Hotel Thilon Drop Off Location',  'Hotel Thilon Pickup Location')
on conflict (code) do update set
  is_airport            = excluded.is_airport,
  dropoff_surcharge_usd = excluded.dropoff_surcharge_usd,
  pickup_surcharge_usd  = excluded.pickup_surcharge_usd,
  requires_stripe       = excluded.requires_stripe,
  allows_cash           = excluded.allows_cash,
  dropoff_display_name  = excluded.dropoff_display_name,
  pickup_display_name   = excluded.pickup_display_name;

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

-- ── Item Tiers ────────────────────────────────────────────────
-- rate_daily_usd    = per-day rate for days 1–7
-- rate_weekly_usd   = per-day rate for day 8+ (ALL days billed at this rate once threshold crossed)
-- insurance_fee_usd = flat fee per item when customer opts into insurance
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

-- ── Add-On Services ───────────────────────────────────────────
-- NOTE (see AGENTS.md): addon_services is not currently wired into the
-- booking flow or pricing — the admin can manage this catalog but
-- customers never see/select an add-on. Seeded here for completeness;
-- it's vestigial until that feature is built.
insert into public.addon_services
  (code, name, description, fee_usd)
values
  ('ADDON_001', 'Airport Delivery Service',
   'Direct luggage collection or delivery at Colombo Airport terminal',
   10.00)
on conflict (code) do update set
  fee_usd = excluded.fee_usd;
