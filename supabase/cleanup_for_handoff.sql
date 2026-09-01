-- ================================================================
-- STOWAWAY — Clean Slate for Client Handoff
--
-- Wipes every row of business/test data while leaving your admin and
-- staff logins intact, so you can hand the client a working, empty
-- instance without losing access to it yourself.
--
-- KEPT:
--   - auth.users / auth.identities / public.staff  (your login access)
--
-- DELETED (in FK-safe order):
--   - public.payments, public.booking_items, public.booking_addons
--   - public.bookings
--   - public.customers
--   - public.email_log, public.audit_log
--   - public.locations, public.time_slots, public.item_tiers,
--     public.addon_services   ← catalog/pricing, not just test data
--   - public.app_settings     ← reverts to code-level defaults; the
--     app keeps working fine without these rows (settings.ts falls
--     back to DEFAULT_SETTINGS). Re-seed by re-running the "Seed
--     defaults" insert block near the top of migration 004 in
--     schema.sql, or the whole schema.sql (idempotent, safe to re-run).
--
-- After running this, the app has NO locations and NO item tiers —
-- the customer booking flow will not work until the client logs into
-- /admin and adds at least one location and one item tier (or you run
-- seed_catalog.sql again with their real pricing/locations before
-- handoff, which is usually the better order: seed their real catalog
-- FIRST, then run this to drop only the test bookings/customers —
-- see the "PARTIAL CLEANUP" variant at the bottom of this file).
--
-- ⚠ Run this only when you're sure. It is NOT reversible outside of
-- your own Supabase backups/point-in-time-recovery.
-- ================================================================

begin;

delete from public.payments;
delete from public.booking_addons;
delete from public.booking_items;
delete from public.bookings;
delete from public.customers;
delete from public.email_log;
delete from public.audit_log;

delete from public.locations;
delete from public.time_slots;
delete from public.item_tiers;
delete from public.addon_services;
delete from public.app_settings;

commit;

-- Verify: everything above should be 0, staff/admin should still show your accounts.
select 'bookings' as table_name, count(*) from public.bookings
union all select 'customers', count(*) from public.customers
union all select 'locations', count(*) from public.locations
union all select 'item_tiers', count(*) from public.item_tiers
union all select 'addon_services', count(*) from public.addon_services
union all select 'time_slots', count(*) from public.time_slots
union all select 'app_settings', count(*) from public.app_settings
union all select 'payments', count(*) from public.payments
union all select 'audit_log', count(*) from public.audit_log
union all select 'email_log', count(*) from public.email_log
union all select 'staff (kept)', count(*) from public.staff;


-- ================================================================
-- PARTIAL CLEANUP VARIANT — usually what you actually want
-- ================================================================
-- If the client already has real locations/pricing seeded (via
-- seed_catalog.sql with their actual values) and you just want to
-- clear out YOUR test bookings/customers without blanking their
-- catalog, comment out the block above and run this instead:
--
-- begin;
-- delete from public.payments;
-- delete from public.booking_addons;
-- delete from public.booking_items;
-- delete from public.bookings;
-- delete from public.customers;
-- delete from public.email_log;
-- delete from public.audit_log;
-- commit;
--
-- This keeps locations, time_slots, item_tiers, addon_services, and
-- app_settings exactly as configured — only test bookings/customers
-- and their history are removed. staff/auth accounts are untouched
-- either way.
-- ================================================================
