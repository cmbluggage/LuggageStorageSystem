<!-- BEGIN:nextjs-agent-rules -->
# Stowaway — Architecture & Engineering Guidelines

Stowaway is a luggage storage/rental booking platform (Sri Lanka, prices shown USD + LKR). Built with Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript, and Supabase (Postgres + Auth). No test suite currently exists — verify changes manually in the browser (`npm run dev`) and with `npm run lint`.

## Design System (Orange & Dark Brown)
- **Primary Accent**: Vibrant Orange (`#EA580C` design tokens / `#e8620a` Figma header+pricing accent / `bg-orange-600`). Used for main action CTAs, active pills, highlights, and primary buttons.
- **Dark Surface**: Rich Dark Brown (`#1C130E`). Used for dark bands, dark footers, text headings, and dark promo containers.
- **Card Geometry**: Soft rounded 16px cards (`rounded-2xl`), circular 40px quantity steppers (`rounded-full`), and custom popover dropdowns.
- **No Native Controls**: Never use native `<select>` or native `<input type="date">`. Always use `CustomSelect` (`src/components/ui/CustomSelect.tsx`) and `CustomDatePicker` (`src/components/ui/CustomDatePicker.tsx`).
- **Typography**: Plus Jakarta Sans is the site-wide default font (`--font-site` in `globals.css`), loaded in `layout.tsx`. It applies everywhere except inside `.admin-shell` (the root wrapper class on `/admin` and `/staff`), which keeps Google Sans (`--font-google-sans`) — those are internal dashboards, not part of the customer-facing brand. `.font-mono-ibm` opts into IBM Plex Mono for accent text (e.g. the pricing table's "PRICING" eyebrow).
- **Header**: One shared header — `src/components/ui/SiteHeader.tsx` — used by the landing page and every customer-facing page (`/book`, `/login`, `/my-bookings`, `/checkout/[id]`, `/booking/[id]`, `/booking/[id]/confirmation`). `variant="landing"` uses in-page `#hash` links; `variant="page"` (default) links to `/#hash`. On mobile (`<sm`) it shows the logo mark only, no wordmark. There is no separate `NavBar` component anymore — it was deleted when unified into `SiteHeader`.
- Shared primitives live in `src/components/ui/` (`Button`, `Card`, `SiteHeader`, `PillTag`, `Toast`, `SmoothScroll`); booking-flow-specific pieces live in `src/components/booking/`; admin primitives in `src/components/admin/`.
- **Smooth scroll**: `lenis` is mounted once via `SmoothScroll.tsx` in the root layout; it no-ops under `prefers-reduced-motion: reduce`. `globals.css` has the corresponding `html.lenis` rules — don't reintroduce `scroll-behavior: smooth` on `html`, it fights Lenis.
- **SEO**: `src/app/sitemap.ts` and `src/app/robots.ts` (Next.js file conventions) plus `src/lib/site.ts` (`SITE_URL`, reads `NEXT_PUBLIC_SITE_URL`, currently a placeholder domain — set the real env var once the production domain is live). Client-component routes (`/book`, `/my-bookings`, `/login`) get their `metadata` export from a sibling `layout.tsx` since a `'use client'` page file can't export `metadata` directly.
- **Landing page section padding**: sections use `px-6 xl:px-0` (not `lg:px-0`) so the horizontal gutter never drops to zero — the content wrapper caps at `max-w-[1180px]`, and `xl` (1280px) is the first breakpoint wide enough that removing padding can't make content touch the viewport edge. Don't reintroduce `lg:px-0` here; between 1024–1180px it left content edge-to-edge.
- **Hero decorative images**: `hero-airport.png`/`hero-luggage.png` are absolutely positioned full-bleed against the true viewport edges (`inset-0` on the section, not inside any `max-w`/grid wrapper — a max-w container there re-introduces dead space between the image and the browser edge). They show from `lg` (1024px) up, scaling from ~30% width at `lg` to the original Figma proportions (37.25%/39.08%) at `2xl`. Their bounding box does overlap the centered `max-w-[980px]` text column by design — the PNGs have transparent padding on their inner edge so the artwork itself doesn't visually clash with the text; don't "fix" that overlap by shrinking/hiding the images, that was already tried and reverted per user feedback (they want the images large and visible from `lg` up, matching the Figma reference).
- **`eval()` console warning in dev**: expected and harmless. `next.config.ts`'s CSP deliberately omits `unsafe-eval`; React's dev-mode debug tooling wants it and logs a warning, but never actually needs it in production. Do not add `unsafe-eval` to fix this.
- **Landing page content width/margins**: sections use `max-w-[1100px]` (was 1180) with responsive padding `px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28` (was `px-6 xl:px-0`) to match the Figma reference's generous side gutters at desktop widths. `SiteHeader` uses the exact same `max-w-[1100px]` + padding scale so the nav bar's edges line up pixel-for-pixel with the page content below it — keep these two in sync if either changes.
- **Services section icons**: the 6 cards under "Our Services" use real `lucide-react` icons (`Lock`, `CalendarClock`, `Clock`, `MapPinned`, `PlaneTakeoff`, `CreditCard`) inside the orange-tinted circle, with a hover animation (icon circle fills orange + scales, card lifts with a soft shadow). No rotate — tried it, looked bad, removed. If adding more service cards, give each a distinct icon rather than reusing a placeholder.

## Project Structure

### Pages (`src/app/`)
- `page.tsx`: Marketing Landing Page with Bounce-style Search Hero (`src/components/landing/LandingPage.tsx`).
- `book/page.tsx`: Dedicated 4-Step Booking Engine (Location -> Time -> Items -> Personal Info).
- `booking/[id]/page.tsx`: Single booking detail view.
- `booking/[id]/confirmation/page.tsx`: Booking Confirmation & QR Pass (uses `qrcode`).
- `my-bookings/page.tsx`: Customer Booking History & Support Dashboard (Direct Call & WhatsApp Team actions), looked up by phone number.
- `checkout/[bookingId]/page.tsx`: Final Checkout & Payment Simulation (cash vs. simulated Stripe).
- `admin/page.tsx`: SuperAdmin Control Panel (Item Tiers, Locations, Addons, Time Slots, Settings, Audit Log, Bookings).
- `staff/page.tsx`: Operations Dashboard (rolling operational window, booking status transitions).
- `login/page.tsx`: Portal Login for Staff & SuperAdmin (strictly accessed via `/login`; redirects unauthenticated users away from `/staff` and `/admin`).

### API Routes (`src/app/api/`)
- `bookings/route.ts`:
  - `POST`: Creates a booking. Validates payload via Zod, enforces IP rate limits and Turnstile bot protection, verifies operational limits and lead times from `app_settings`, recalculates pricing server-side from live DB rows (fails closed if DB is unreachable), and calls `saveBooking`.
  - `GET`: Customer booking lookup by `?phone=...` (rate limited per IP, omits passport number for privacy).
- `bookings/[id]/route.ts`: `GET` fetches a booking by id; `PATCH` updates payment method/status via `updateBookingPayment` (server enforces airport-cash lockout regardless of client payload — see Business Rules below).
- `locations/route.ts`, `item-tiers/route.ts`, `addons/route.ts`, `time-slots/route.ts`: Full catalog CRUD endpoints backed by `createCatalogHandlers` (`GET` is public or `?all=1` for admin; `POST`, `PATCH`, `DELETE` are protected by `requireSuperAdmin`).
- `admin/bookings/route.ts` (`GET`): Paginated booking browser for SuperAdmin with status, payment status, and search query filters.
- `admin/settings/route.ts` (`GET`): Returns full `app_settings` rows (types, labels, min/max bounds) for the SuperAdmin settings control panel.
- `settings/route.ts`:
  - `GET`: Serves safe public subset of dynamic settings and the Turnstile site key for the booking engine.
  - `PATCH`: SuperAdmin endpoint to update configuration with server-side validation against declared type and min/max bounds, with audit logging.
- `staff/operations/route.ts` (`GET`): Operations board endpoint flattening upcoming bookings into time-ordered drop-off and pick-up tasks grouped by location over a configurable rolling horizon window.
- `staff/bookings/[id]/route.ts`:
  - `GET`: Fetches full booking details (including passport number) for staff.
  - `PATCH`: Advances or cancels booking status, enforcing valid state transitions (`ALLOWED_TRANSITIONS`) and logging to `public.audit_log`.
- `audit-log/route.ts` (`GET`): Reads `public.audit_log` with search and pagination for the admin panel.
- `exchange-rate/route.ts` (`GET`): Serves the live USD→LKR rate consumed by `src/lib/currency.ts`.

### Core Logic (`src/lib/`)
- `pricing.ts`: **Single source of truth** for duration and price calculations. Imported by both client components and server API routes — never re-implement duration/fee math elsewhere.
  - `calculateDuration`: bills in whole 24-hour cycles, `Math.ceil`, minimum 1 day (or configured `minBookingDays`).
  - `effectiveDailyRate`: bookings ≤ `weekThresholdDays` use `rate_daily_usd`; bookings > threshold use `rate_weekly_usd` applied to **all** days.
  - `calculateGrandTotal` = itemFee + dropoffSurcharge + pickupSurcharge + airportServiceFee + insuranceFee.
- `db.ts`: Supabase data-access layer for bookings (`saveBooking`, `updateBookingPayment`, `updateBookingStatus`, `getBookingsByPhone`, `getBookingById`, `listBookings`, `getOperationalBookings`). All writes use the service-role client (`createAdminClient`) and fail closed on database errors (no unpersisted in-memory mocks).
- `settings.ts`: Dynamic business settings layer with in-memory caching and fallbacks to `DEFAULT_SETTINGS`.
- `locations.ts`: Location predicates and payment resolvers (`bookingTouchesAirport`, `isAirportLocation`, `resolvePayment`).
- `timeSlots.ts`: Time slot types (`window` = 2h block, `hourly` = 1h precision) plus `DEFAULT_TIME_SLOTS` and a `localStorage`-backed override (client-side only; server ignores it).
- `currency.ts`: USD↔LKR formatting; fetches the live rate client-side from `/api/exchange-rate` on load and caches it in a module-level variable (falls back to `NEXT_PUBLIC_USD_TO_LKR` env var, default 320).
- `auth/guard.ts`: Session and role enforcement (`requireStaff`, `requireSuperAdmin`, `getAuthActor`).
- `security/rateLimit.ts` & `security/turnstile.ts`: In-memory IP token bucket rate limiting and Cloudflare Turnstile token verification.
- `audit.ts`: `writeAudit` helper for writing audit records into `public.audit_log`.
- `api/http.ts` & `api/catalog.ts`: Standardized HTTP JSON response utilities (`ok`, `fail`, `badRequest`, `serverError`, `NO_STORE`) and generic CRUD handler generator.
- `validation/schemas.ts`: Central Zod schemas for all bookings, catalogs, status updates, settings, and query parameters.
- `supabase/admin.ts`: Service-role Supabase client factory for secure server-side operations bypassing RLS.
- `supabase/client.ts` / `supabase/server.ts`: Browser and server Supabase client factories.
- `supabase/types.ts`: Hand-maintained `Database` type mirroring the SQL schema — **keep in sync manually** when migrations change columns (not auto-generated).

### Middleware
- `src/proxy.ts` (Next's middleware entry point): Protects `/staff/:path*` and `/admin/:path*`. Validates the Supabase JWT locally via `getClaims()` (no network round-trip), redirects unauthenticated users to `/login`, and redirects non-`superadmin` roles away from `/admin` to `/staff`. Role resolution order: `app_metadata.role` → `user_metadata.role` → hardcoded fallback (`admin@stowaway.lk` → `superadmin`, else `staff`).

## Business Rules Worth Knowing
- **Airport/CMB cash lockout**: Any booking touching an airport location (`is_airport`, `requires_stripe`, `code === 'LOC_001'`, or id/code containing `"airport"`/`"cmb"`) is forced to `payment_method = stripe_simulated` and `payment_status = paid`, and cash is disallowed — enforced **server-side** in both `saveBooking` and `updateBookingPayment` regardless of what the client sends. Do not weaken this to a client-only check.
- **Pricing is always recalculated server-side** in `POST /api/bookings` from live `item_tiers` rows; client-submitted totals are not trusted and booking creation fails closed if database pricing cannot be loaded.
- **Duration billing**: Elapsed time in whole 24-hour cycles; crossing a 24h boundary rounds up to the next whole day (see `pricing.ts` doc comment for exact examples).
- Insurance is a flat per-item fee (`insurance_fee_usd`) charged once per unit when `insuranceEnabled`, independent of duration.
- `booking_status` lifecycle: `confirmed` → `in_transit` → `deposited` → `picked_up` (or `cancelled`). Enforced server-side via `ALLOWED_TRANSITIONS` in `/api/staff/bookings/[id]`. Staff dashboard operates on a rolling window (`ops_window_hours`) of these.

## Database Schema (Supabase)
Migrations live in `supabase/migrations/` (`001_schema.sql`, `002_add_insurance_hourly_slots.sql`, `003_public_inserts.sql`, `004_security_settings_ops.sql`, `005_item_tier_images.sql`); seed data in `supabase/seed.sql`. Ad-hoc RLS/auth patches: `supabase/fix_admin_rls.sql`, `supabase/fix_auth_passwords.sql`. `src/lib/supabase/types.ts` is the authoritative TS shape.

- `public.locations`: Dropoff/pickup points. Flags: `is_airport`, `requires_stripe`, `allows_cash`, plus `dropoff_surcharge_usd` / `pickup_surcharge_usd`.
- `public.time_slots`: Admin-configurable operational windows (`slot_type`: `window`|`hourly`, `day_of_week`, optional `specific_date` override).
- `public.item_tiers`: Pricing catalog — `rate_daily_usd`, `rate_weekly_usd` (post-7-day rate), `insurance_fee_usd`, `image_url`, `display_order`.
- `public.addon_services`: Additional paid services (e.g. airport delivery), `fee_usd`.
- `public.customers`: Verified customer profiles (`phone`, `full_name`, `email`, `passport_number`, OTP fields).
- `public.bookings`: Main reservation table — FKs to `customers`/`locations`, computed totals, `payment_method` (`cash`|`stripe_simulated`), `payment_status`, `booking_status`, `qr_code_token`, `duration_days`, `insurance_enabled`, `idempotency_key`.
- `public.booking_items`: Line items per booking (tier + quantity + rate snapshot).
- `public.booking_addons`: Addon selections per booking.
- `public.staff`: Portal users — `role` (`staff`|`superadmin`) linked to Supabase Auth `user_id`.
- `public.app_settings`: Dynamic business configuration (insurance, pricing rules, limits, contact numbers).
- `public.audit_log`: INSERT/UPDATE/DELETE trail with actor, summary, old/new values, surfaced in the admin panel.

## Deployment Instructions
1. Run `supabase db push` or execute `supabase/migrations/001_schema.sql`, `002_add_insurance_hourly_slots.sql`, `003_public_inserts.sql`, `004_security_settings_ops.sql`, `005_item_tier_images.sql` (in order) and `supabase/seed.sql` in your Supabase SQL Editor.
2. Deploy to Vercel with environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY` (Secret key from Supabase Project Settings > API)
   - `NEXT_PUBLIC_USD_TO_LKR` (optional fallback exchange rate; live rate is served by `/api/exchange-rate`)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (optional, for Cloudflare Turnstile bot verification)
<!-- END:nextjs-agent-rules -->
