import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Bookings',
  description: 'Look up your luggage storage booking, QR pass, and support options by phone number.',
  alternates: { canonical: '/my-bookings' },
  robots: { index: false, follow: false },
};

export default function MyBookingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
