-- ── Remove the redundant global "airport handling fee" ──────────
--
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
--
-- The booking flow's "Arrival Flight Number" field was being stuffed into
-- the generic `notes` column, so staff had no reliable way to tell a
-- flight number apart from an actual free-text note. Separate columns.
alter table public.bookings
  add column if not exists flight_number text;

-- ── Cash collection tracking ──────────────────────────────────────
--
-- Staff need to mark a cash payment as physically collected (as opposed
-- to payment_status simply flipping to 'paid'), and admins need to see
-- who collected it and when, for end-of-day reconciliation. Attribution
-- lives here rather than only in the audit log so it can be queried/
-- reported on directly (e.g. "cash collected by X today").
-- References staff(user_id) rather than auth.users(id) directly so
-- PostgREST can embed the collecting staff member's name in one query
-- (`bookings.select('*, collected_by:staff!cash_collected_by(full_name)')`)
-- instead of a second round-trip.
alter table public.bookings
  add column if not exists cash_collected_by uuid references public.staff(user_id),
  add column if not exists cash_collected_at timestamptz;

comment on column public.bookings.flight_number is 'Optional arrival flight number entered by the customer at booking time.';
comment on column public.bookings.cash_collected_by is 'staff.user_id of whoever marked this booking''s cash payment as physically collected.';
comment on column public.bookings.cash_collected_at is 'When the cash payment was marked collected. Null for card payments and uncollected cash.';
