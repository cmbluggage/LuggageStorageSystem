'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Card } from '@/components/ui/Card';
import { PillTag } from '@/components/ui/PillTag';
import { Button } from '@/components/ui/Button';
import { formatUSD, formatLKR } from '@/lib/currency';
import { CheckCircle2, Truck, Box, PartyPopper, XCircle, CreditCard, Banknote, CalendarDays, Luggage } from 'lucide-react';

const STATUS_CONFIG = {
  confirmed:  { label: 'Confirmed',   color: 'soft' as const, icon: <CheckCircle2 className="w-4 h-4" /> },
  in_transit: { label: 'In Transit',  color: 'soft' as const, icon: <Truck className="w-4 h-4" /> },
  deposited:  { label: 'Stored',      color: 'soft' as const, icon: <Box className="w-4 h-4" /> },
  picked_up:  { label: 'Picked Up',   color: 'soft' as const, icon: <PartyPopper className="w-4 h-4" /> },
  cancelled:  { label: 'Cancelled',   color: 'soft' as const, icon: <XCircle className="w-4 h-4" /> },
};

// Demo booking — in production fetched from Supabase
const DEMO_BOOKING = {
  id: 'demo-booking-123',
  status: 'confirmed' as keyof typeof STATUS_CONFIG,
  customer: { phone: '+94 71 234 5678' },
  dropoffLocation: 'CMB Airport',
  pickupLocation: 'Hotel Thilon',
  storageStartDate: '2026-07-26',
  storageEndDate: '2026-07-28',
  days: 2,
  items: [
    { name: 'Carry-On Luggage', qty: 2, icon: <Luggage className="w-5 h-5 text-[var(--color-ink)]" />, lineTotalUsd: 4.00 },
    { name: 'Odd-Sized Items',  qty: 1, icon: <Luggage className="w-5 h-5 text-[var(--color-ink)]" />, lineTotalUsd: 10.00 },
  ],
  addons: [{ name: 'Airport Pickup/Delivery', fee: 10.00 }],
  dropoffSurcharge: 10.00,
  grandTotal: 38.00,
  paymentMethod: 'stripe_simulated',
  paymentStatus: 'paid',
  createdAt: '2026-07-25T19:00:00Z',
  qrCodeToken: 'demo-booking-123',
};

const TIMELINE = [
  { status: 'confirmed',  label: 'Booking Confirmed',    date: '25 Jul 2026', done: true },
  { status: 'in_transit', label: 'Luggage Collected',    date: '26 Jul 2026', done: false },
  { status: 'deposited',  label: 'Items Stored Securely',date: '26 Jul 2026', done: false },
  { status: 'picked_up',  label: 'Items Collected',      date: '28 Jul 2026', done: false },
];

export default function BookingDetailPage() {
  const params    = useParams();
  const bookingId = params.id as string;
  const booking   = DEMO_BOOKING; // TODO: fetch from Supabase

  const statusConf = STATUS_CONFIG[booking.status];

  return (
    <div className="min-h-screen bg-[var(--color-canvas-soft)] text-[var(--color-ink)]">
      <SiteHeader />

      <main className="max-w-[var(--max-w-content)] mx-auto py-[var(--space-3xl)] px-[var(--space-2xl)]" id="booking-detail-main">
        {/* Header */}
        <div className="mb-[var(--space-2xl)]">
          <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-sm)] flex-wrap">
            <PillTag variant={statusConf.color} className="gap-2">
              {statusConf.icon} {statusConf.label}
            </PillTag>
            <span className="text-body-sm text-[var(--color-mute)] font-mono">
              #{bookingId?.slice(0, 8).toUpperCase() ?? 'DEMO0001'}
            </span>
          </div>
          <h1 className="text-display-lg">Your Booking</h1>
          <p className="text-body-md text-[var(--color-body)] mt-2">
            Track the status and details of your stored luggage.
          </p>
        </div>

        <div className="flex flex-col gap-[var(--space-2xl)] max-w-2xl">
          {/* Status timeline */}
          <Card variant="content">
            <h2 className="text-display-sm mb-[var(--space-xl)]">Status Timeline</h2>
            <div className="flex flex-col gap-0">
              {TIMELINE.map(({ label, date, done }, idx) => (
                <div key={label} className="flex items-start gap-[var(--space-md)]">
                  <div className="flex flex-col items-center">
                    <div className={[
                      'w-6 h-6 rounded-[var(--radius-full)] flex-shrink-0 border-2 flex items-center justify-center transition-colors',
                      done ? 'bg-[var(--color-ink)] border-[var(--color-ink)]' : 'bg-[var(--color-canvas)] border-[var(--color-surface-pressed)]',
                    ].join(' ')}>
                      {done && <div className="w-2.5 h-2.5 rounded-[var(--radius-full)] bg-[var(--color-canvas)]" />}
                    </div>
                    {idx < TIMELINE.length - 1 && (
                      <div className={`w-0.5 h-10 ${done ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-surface-pressed)]'}`} />
                    )}
                  </div>
                  <div className="pb-[var(--space-lg)] mt-[-2px]">
                    <p className={`text-body-md-strong ${done ? 'text-[var(--color-ink)]' : 'text-[var(--color-mute)]'}`}>
                      {label}
                    </p>
                    <p className="text-body-sm text-[var(--color-mute)]">{date}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Items stored */}
          <Card variant="content">
            <h2 className="text-display-sm mb-[var(--space-xl)]">Items Stored</h2>
            <div className="flex flex-col gap-[var(--space-md)]">
              {booking.items.map(item => (
                <div key={item.name} className="flex justify-between items-center bg-[var(--color-canvas-soft)] p-[var(--space-md)] rounded-[var(--radius-md)]">
                  <div className="flex items-center gap-[var(--space-md)]">
                    <span>{item.icon}</span>
                    <div>
                      <p className="text-body-sm-strong">{item.qty}× {item.name}</p>
                      <p className="text-body-sm text-[var(--color-mute)]">{booking.days} day(s)</p>
                    </div>
                  </div>
                  <span className="text-body-sm-strong">{formatUSD(item.lineTotalUsd)}</span>
                </div>
              ))}
              {booking.addons.map(a => (
                <div key={a.name} className="flex justify-between items-center p-[var(--space-xs)] mt-2">
                  <span className="text-body-sm text-[var(--color-body)]">{a.name}</span>
                  <span className="text-body-sm-strong">+{formatUSD(a.fee)}</span>
                </div>
              ))}
              {booking.dropoffSurcharge > 0 && (
                <div className="flex justify-between items-center p-[var(--space-xs)]">
                  <span className="text-body-sm text-[var(--color-body)]">Drop-off fee</span>
                  <span className="text-body-sm-strong">+{formatUSD(booking.dropoffSurcharge)}</span>
                </div>
              )}
              <div className="border-t border-[var(--color-surface-pressed)] pt-[var(--space-md)] mt-[var(--space-xs)] flex justify-between">
                <span className="text-body-md-strong">Total</span>
                <div className="text-right">
                  <p className="text-display-sm">{formatUSD(booking.grandTotal)}</p>
                  <p className="text-caption text-[var(--color-mute)]">{formatLKR(booking.grandTotal)}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Locations & dates */}
          <Card variant="content">
            <h2 className="text-display-sm mb-[var(--space-xl)]">Locations & Dates</h2>
            <div className="grid grid-cols-2 gap-[var(--space-lg)]">
              <div className="bg-[var(--color-canvas-soft)] p-[var(--space-md)] rounded-[var(--radius-md)]">
                <p className="text-body-sm text-[var(--color-mute)] mb-1 uppercase tracking-wide">Drop-off</p>
                <p className="text-body-sm-strong mb-1 flex items-center gap-2">
                  <Box className="w-4 h-4" /> {booking.dropoffLocation}
                </p>
                <p className="text-body-sm text-[var(--color-mute)] flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" /> {booking.storageStartDate}
                </p>
              </div>
              <div className="bg-[var(--color-canvas-soft)] p-[var(--space-md)] rounded-[var(--radius-md)]">
                <p className="text-body-sm text-[var(--color-mute)] mb-1 uppercase tracking-wide">Pick-up</p>
                <p className="text-body-sm-strong mb-1 flex items-center gap-2">
                  <Box className="w-4 h-4" /> {booking.pickupLocation}
                </p>
                <p className="text-body-sm text-[var(--color-mute)] flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" /> {booking.storageEndDate}
                </p>
              </div>
              <div className="bg-[var(--color-canvas-soft)] p-[var(--space-md)] rounded-[var(--radius-md)]">
                <p className="text-body-sm text-[var(--color-mute)] mb-1 uppercase tracking-wide">Payment</p>
                <p className="text-body-sm-strong flex items-center gap-2">
                  {booking.paymentMethod === 'stripe_simulated' ? <CreditCard className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                  {booking.paymentMethod === 'stripe_simulated' ? 'Card (Simulated)' : 'Cash'}
                </p>
                <PillTag variant="soft" className="mt-2">
                  {booking.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                </PillTag>
              </div>
              <div className="bg-[var(--color-canvas-soft)] p-[var(--space-md)] rounded-[var(--radius-md)]">
                <p className="text-body-sm text-[var(--color-mute)] mb-1 uppercase tracking-wide">Booked</p>
                <p className="text-body-sm-strong flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {new Date(booking.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-[var(--space-md)]">
            <Link href={`/booking/${bookingId}/confirmation`}>
              <Button variant="secondary" fullWidth id="view-qr-btn">
                View QR Code
              </Button>
            </Link>
            <Link href="/">
              <Button variant="primary" fullWidth id="book-another-detail-btn">
                Book Another Storage
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
