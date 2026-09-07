-- ================================================================
-- STOWAWAY — Migration 010
-- Direction-aware location display names
--
-- Client requirement, 2026-09: the same physical location (e.g. the
-- airport counter) is offered as both a drop-off option and a pick-up
-- option in the booking flow's location picker, but the client wants each
-- direction to show its own label ("CMB Airport Drop Off Location" when
-- picking drop-off, "CMB Airport Pickup Location" when picking pick-up)
-- rather than the same base name in both places.
--
-- Rather than duplicating each site into two catalog rows (which would
-- wrongly let a "pickup-only" row be selected as a drop-off, and would
-- split one physical location's surcharge/hours/flags across two rows),
-- add two optional display-name overrides to the existing row. Both fall
-- back to the base `name` column when unset, so this is backward
-- compatible with any location added before this migration.
-- ================================================================

alter table public.locations
  add column if not exists dropoff_display_name text,
  add column if not exists pickup_display_name  text;

comment on column public.locations.dropoff_display_name is 'Optional label shown for this location in the booking flow''s drop-off picker only. Falls back to name when null.';
comment on column public.locations.pickup_display_name  is 'Optional label shown for this location in the booking flow''s pick-up picker only. Falls back to name when null.';

update public.locations set
  dropoff_display_name = 'CMB Airport Drop Off Location',
  pickup_display_name  = 'CMB Airport Pickup Location'
where code = 'LOC_001' and dropoff_display_name is null;

update public.locations set
  dropoff_display_name = 'Hotel Thilon Drop Off Location',
  pickup_display_name  = 'Hotel Thilon Pickup Location'
where code = 'LOC_002' and dropoff_display_name is null;
