-- ── Payments ledger ────────────────────────────────────────────
--
-- bookings.payment_status was a binary pending/paid flag, which cannot
-- represent "this booking was extended and now owes more, on top of what
-- was already collected." This table is the source of truth for every
-- money movement (a cash collection or a Stripe charge); bookings.payment_
-- status becomes a derived/cached summary kept in sync by application code,
-- not the authority.
--
-- References staff(user_id) rather than auth.users(id) directly, same
-- reasoning as bookings.cash_collected_by (migration 006): lets PostgREST
-- embed the collecting staff member's name in one query.
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
--
-- "Did the customer actually get their confirmation email" is a real
-- support question the moment a send fails or bounces silently. This is
-- deliberately a log, not a queue — sends are best-effort and inline with
-- the triggering request (see src/lib/email.ts), never blocking it.
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
