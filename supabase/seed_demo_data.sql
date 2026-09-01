-- ================================================================
-- STOWAWAY — Demo Data (dev/testing ONLY — do not run against the
-- client's production database)
-- Run AFTER schema.sql + seed_catalog.sql.
--
-- Fake customers and bookings so you have something to click through
-- on /staff and /admin without manually creating a booking first.
-- Before handing the project to the client, run cleanup_for_handoff.sql
-- to remove all of this.
-- ================================================================

-- ── Demo customers ──────────────────────────────────────────────
insert into public.customers
  (phone, full_name, email, passport_number)
values
  ('+94 77 555 1234', 'Pasan Dhanushka', 'pasan@stowaway.lk',       'N9876543'),
  ('+1 415 555 0199', 'Alex Rivera',     'alex.rivera@gmail.com',    'A4829105'),
  ('+81 90 1234 5678','Sophia Tanaka',   'sophia.tanaka@japan.jp',   'TK901234')
on conflict (phone) do nothing;

-- ── Demo bookings ───────────────────────────────────────────────
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
  current_date, current_date + 2,
  18.00, 10.00, 0.00,
  4.80, 32.80,
  'stripe_simulated', 'paid', 'confirmed',
  'UL 504', null
from public.customers c, public.locations l1, public.locations l2
where c.phone = '+94 77 555 1234'
  and l1.code = 'LOC_001'
  and l2.code = 'LOC_002'
  and not exists (
    select 1 from public.bookings b
    where b.customer_id = c.id and b.flight_number = 'UL 504'
  );

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
  current_date - 1, current_date + 2,
  36.00, 0.00, 10.00,
  0.00, 46.00,
  'cash', 'pending', 'deposited',
  null, 'Surfboard & carry-on bag storage'
from public.customers c, public.locations l1, public.locations l2
where c.phone = '+1 415 555 0199'
  and l1.code = 'LOC_002'
  and l2.code = 'LOC_001'
  and not exists (
    select 1 from public.bookings b
    where b.customer_id = c.id and b.notes = 'Surfboard & carry-on bag storage'
  );

-- Records payments for the two demo bookings above so balanceDueUsd
-- reflects reality (they'd otherwise show as fully unpaid regardless
-- of payment_status, since the payments ledger is the actual authority).
insert into public.payments (booking_id, amount_usd, method, status)
select b.id, b.grand_total_usd, 'stripe', 'succeeded'
from public.bookings b
join public.customers c on c.id = b.customer_id
where c.phone = '+94 77 555 1234' and b.flight_number = 'UL 504'
  and not exists (select 1 from public.payments p where p.booking_id = b.id);
