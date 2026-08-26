import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book Luggage Storage',
  description: 'Book secure luggage storage near Colombo Airport in a few minutes — choose your location, time, and items.',
  alternates: { canonical: '/book' },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
