-- ── Email OTP verification ───────────────────────────────────────
--
-- Replaces the phone-only /my-bookings lookup (a phone number is
-- knowable/guessable by someone other than the customer, so it was never
-- a real credential) and adds a gate in front of booking creation, so a
-- customer's typed email is proven deliverable before a booking is made
-- against it. Client requirement, 2026-09.
--
-- A dedicated table rather than reusing customers.otp_code/otp_expires_at
-- (migration 001): those columns are keyed to an existing customer row,
-- but "verify email before booking" runs before a customer necessarily
-- exists, and both flows need independent expiry/attempt/purpose tracking.
-- The old columns were never wired into any code path — dropped below.
create table if not exists public.otp_verifications (
  id           uuid primary key default gen_random_uuid(),
  -- Always the email the code was actually sent to. For 'booking_lookup'
  -- this is the customer's on-file email, resolved server-side from
  -- whatever phone/email the requester typed — never the raw input, so a
  -- lookup can't be used to send mail to an address the requester doesn't
  -- already own on this account.
  email        text not null,
  purpose      text not null check (purpose in ('booking_create', 'booking_lookup')),
  -- HMAC-SHA256 of the 6-digit code, never the code itself — a DB leak
  -- must not expose usable codes.
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  max_attempts int not null default 5,
  -- Set the moment the correct code is entered.
  verified_at  timestamptz,
  -- Set the moment a verified row is actually spent by its purpose
  -- (booking creation, or a bookings-list fetch) — single-use, so a
  -- verified code can't be replayed against a second booking/session.
  used_at      timestamptz,
  -- Resolved at request time for 'booking_lookup' so the eventual fetch
  -- doesn't need to re-run the phone/email -> customer lookup.
  customer_id  uuid references public.customers(id) on delete cascade,
  request_ip   text,
  created_at   timestamptz not null default now()
);

create index if not exists otp_verifications_email_purpose_idx
  on public.otp_verifications (email, purpose, created_at desc);

alter table public.otp_verifications enable row level security;
revoke all on public.otp_verifications from anon, authenticated;

comment on table public.otp_verifications is 'Short-lived email verification codes gating booking creation and the /my-bookings lookup. Service-role only.';

-- Vestigial, never wired into any code path.
alter table public.customers drop column if exists otp_code;
alter table public.customers drop column if exists otp_expires_at;

-- Email is now required at booking time (the OTP gate is meaningless on
-- an optional field) — enforced at the Zod layer too, but a DB
-- constraint means no future code path can create an email-less customer
-- by accident. Existing NULL rows (pre-launch demo data only) are
-- backfilled with a placeholder so the constraint can attach; there is
-- no real customer data to protect on this project yet.
update public.customers set email = 'unknown+' || id::text || '@invalid.local' where email is null;
alter table public.customers alter column email set not null;
