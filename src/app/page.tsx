import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Luggage Storage Colombo — Luggage Storage Service Colombo Airport',
  description:
    'Secure, convenient luggage storage near Colombo airport. Drop off your bags in minutes and enjoy exploring the island hands-free and hassle-free.',
  keywords: 'luggage storage, Colombo airport, CMB, bag storage, travel, Hotel Thilon',
  openGraph: {
    title: 'Luggage Storage Colombo — Luggage Storage Service Colombo Airport',
    description: 'Secure, convenient luggage storage near Colombo airport. Drop off your bags in minutes.',
    type: 'website',
  },
};

export default function HomePage() {
  return <LandingPage />;
}
