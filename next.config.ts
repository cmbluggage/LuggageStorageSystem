import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * Scoped to what the app actually loads:
 *  - Turnstile injects its widget script and iframe from challenges.cloudflare.com.
 *  - Supabase is reached over https/wss from the browser client.
 *  - The exchange-rate feed is called server-side, so it needs no connect-src.
 *
 * 'unsafe-inline' on style-src is required by Tailwind's runtime style
 * injection; 'unsafe-eval' is deliberately NOT granted.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Clickjacking protection for browsers that predate frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // The staff QR scanner (src/components/staff/QrScanner.tsx) needs the
  // camera on this origin only; everything else the app doesn't use stays
  // denied entirely rather than left open.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=(), payment=()',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Booking, payment and staff data must never be cached by a proxy.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
