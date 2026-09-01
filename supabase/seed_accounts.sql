-- ================================================================
-- STOWAWAY — Admin & Staff Login Accounts
-- Run AFTER schema.sql (and seed_catalog.sql, any order between the two).
--
-- ⚠ SECURITY — READ BEFORE RUNNING ⚠
-- Replace CHANGE_ME_ADMIN_PASSWORD and CHANGE_ME_STAFF_PASSWORD below
-- with real, unique, strong passwords BEFORE running this in the SQL
-- Editor. Do not commit this file back to git with real passwords
-- filled in — this repo may be forked/shared, and a password in git
-- history stays recoverable forever even if you change it later.
-- After running, immediately log in once at /login and rotate the
-- password again from a private note, or set up Supabase's password
-- reset flow — treat what you type into this file as a one-time
-- bootstrap credential, not the permanent one.
--
-- Safe to re-run: password/metadata updates are idempotent, and the
-- auth.identities insert (required for signInWithPassword to work —
-- Supabase 500s without it) only fires when missing.
-- ================================================================

create extension if not exists pgcrypto;

-- ── 1. Admin (superadmin) user ──────────────────────────────────
insert into auth.users
  (id, instance_id, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@stowaway.lk',                                    -- ← change to your real admin email
  crypt('CHANGE_ME_ADMIN_PASSWORD', gen_salt('bf')),      -- ← change before running
  now(),
  '{"provider":"email","providers":["email"],"role":"superadmin"}'::jsonb,
  '{"full_name":"Operations Director","role":"superadmin"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
where not exists (select 1 from auth.users where email = 'admin@stowaway.lk');

update auth.users
set encrypted_password = crypt('CHANGE_ME_ADMIN_PASSWORD', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data  = '{"provider":"email","providers":["email"],"role":"superadmin"}'::jsonb,
    raw_user_meta_data = '{"full_name":"Operations Director","role":"superadmin"}'::jsonb,
    updated_at         = now()
where email = 'admin@stowaway.lk';

-- ── 2. Staff user ────────────────────────────────────────────────
insert into auth.users
  (id, instance_id, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'staff@stowaway.lk',                                    -- ← change to your real staff email
  crypt('CHANGE_ME_STAFF_PASSWORD', gen_salt('bf')),      -- ← change before running
  now(),
  '{"provider":"email","providers":["email"],"role":"staff"}'::jsonb,
  '{"full_name":"Operational Staff","role":"staff"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
where not exists (select 1 from auth.users where email = 'staff@stowaway.lk');

update auth.users
set encrypted_password = crypt('CHANGE_ME_STAFF_PASSWORD', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data  = '{"provider":"email","providers":["email"],"role":"staff"}'::jsonb,
    raw_user_meta_data = '{"full_name":"Operational Staff","role":"staff"}'::jsonb,
    updated_at         = now()
where email = 'staff@stowaway.lk';

-- ── 3. public.staff rows (role source for the admin/staff proxy guard) ──
insert into public.staff (user_id, role, full_name)
select u.id, 'superadmin', 'Operations Director (SuperAdmin)'
from auth.users u where u.email = 'admin@stowaway.lk'
on conflict (user_id) do nothing;

insert into public.staff (user_id, role, full_name)
select u.id, 'staff', 'Operational Staff'
from auth.users u where u.email = 'staff@stowaway.lk'
on conflict (user_id) do nothing;

-- ── 4. auth.identities (required for signInWithPassword) ──────────
-- Supabase's password sign-in requires a matching identity row per
-- user; the auth.users insert above does not create one automatically
-- when done via raw SQL (only Supabase's own signup API does that).
-- Missing this causes a 500 on login, not a clean "invalid password".
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

-- ── Verify ──────────────────────────────────────────────────────
select
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  count(i.id) as identity_count
from auth.users u
left join auth.identities i on i.user_id = u.id
where u.email in ('admin@stowaway.lk', 'staff@stowaway.lk')
group by u.email, u.email_confirmed_at;
