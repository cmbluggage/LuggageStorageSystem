import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff Portal Sign In',
  description: 'Staff and SuperAdmin sign in for Luggage Storage Colombo operations.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
