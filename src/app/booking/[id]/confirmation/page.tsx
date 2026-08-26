'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { Button } from '@/components/ui/Button';
import { formatUSD, formatLKR } from '@/lib/currency';
import { notify } from '@/lib/toast';
import { QrCode, CheckCircle2, MapPin, Printer, ShieldCheck, Download, Banknote, CreditCard } from 'lucide-react';
import type { BookingRecord } from '@/lib/db';

function ConfirmationContent() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const bookingId    = params.id as string;
  const pmQuery      = searchParams.get('pm');
  const qrRef        = useRef<HTMLCanvasElement>(null);
  const [booking, setBooking] = useState<BookingRecord | null>(null);

  const bookingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/booking/${bookingId}`
    : `/booking/${bookingId}`;

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}`)
      .then(res => res.json())
      .then(data => {
        if (data.booking) setBooking(data.booking);
      })
      .catch(console.error);
  }, [bookingId]);

  useEffect(() => {
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, bookingUrl, {
        width: 220,
        margin: 2,
        color: { dark: '#1C130E', light: '#ffffff' },
      });
    }
  }, [bookingUrl]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      notify.info('Opening print dialog...');
      window.print();
    }
  };

  const handleDownloadQr = () => {
    if (!qrRef.current) return;
    const link = document.createElement('a');
    link.download = `stowaway-pass-${bookingId}.png`;
    link.href = qrRef.current.toDataURL('image/png');
    link.click();
    notify.success('QR Pass downloaded to your device!');
  };

  const grandTotal = booking?.grandTotalUsd || 33.00;
  const isCashPayment = pmQuery === 'cash' || booking?.paymentMethod === 'cash' || booking?.paymentStatus === 'pending';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white">
      <div className="print:hidden">
        <SiteHeader />
      </div>

      <main className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6" id="confirmation-main">
        {/* Success header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4 animate-scale-in">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <span className={`px-3.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-3 ${
            isCashPayment ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {isCashPayment ? 'Reservation Reserved — Cash Due at Drop-off' : 'Booking Confirmed & Paid'}
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1C130E] tracking-tight">You&apos;re all set!</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-md mx-auto font-medium leading-relaxed">
            {isCashPayment
              ? 'Your storage spot is reserved. Present this QR pass and pay cash at drop-off.'
              : 'Your luggage storage is confirmed. Present this QR pass at drop-off.'}
          </p>
        </div>

        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
          {/* Beautiful Ticket Pass Card */}
          <div className="bg-white rounded-3xl border-2 border-[#1C130E] shadow-2xl overflow-hidden animate-fade-in">
            {/* Header banner */}
            <div className="bg-[#1C130E] text-white p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-orange-400 uppercase tracking-widest">Luggage Storage Colombo Pass</p>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  {booking?.fullName || 'Valued Guest'}
                </h3>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase ${
                  isCashPayment ? 'bg-amber-500 text-amber-950' : 'bg-orange-600 text-white'
                }`}>
                  {isCashPayment ? 'Cash On Arrival' : 'Paid & Confirmed'}
                </span>
              </div>
            </div>

            {/* QR Section */}
            <div className="p-8 flex flex-col items-center bg-slate-50/50 border-b border-dashed border-slate-200">
              <p className="text-xs font-bold uppercase tracking-wider mb-4 text-slate-500 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-orange-600" />
                Scan Code at Drop-off Location
              </p>

              <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md">
                <canvas
                  ref={qrRef}
                  className="rounded-xl"
                  style={{ imageRendering: 'pixelated' }}
                  aria-label="Booking QR code"
                  id="booking-qr-code"
                />
              </div>

              <p className="text-base font-black text-[#1C130E] mt-4 font-mono tracking-wider">
                #{bookingId?.toUpperCase() ?? 'BK-RESERVATION'}
              </p>
            </div>

            {/* Cash Due Notice Notice */}
            {isCashPayment && (
              <div className="mx-6 sm:mx-8 mt-6 p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-950">
                <Banknote className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-amber-900">Payment Due at Drop-off</p>
                  <p className="text-xs font-medium text-amber-900 mt-0.5 leading-relaxed">
                    Please have <strong>{formatUSD(grandTotal)} ({formatLKR(grandTotal)})</strong> in cash ready when dropping off your items at the storage location.
                  </p>
                </div>
              </div>
            )}

            {/* Ticket details body */}
            <div className="p-6 sm:p-8 bg-white grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-semibold">
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">Customer Contact</p>
                <p className="text-slate-900 font-extrabold text-sm">{booking?.phone || '+94 77 555 1234'}</p>
                {booking?.email && <p className="text-slate-500 font-medium mt-0.5">{booking.email}</p>}
              </div>

              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                  {isCashPayment ? 'Payment Due on Arrival' : 'Total Paid'}
                </p>
                <p className={`text-2xl font-black ${isCashPayment ? 'text-amber-700' : 'text-orange-600'}`}>
                  {formatUSD(grandTotal)}
                </p>
                <p className="text-xs font-bold text-slate-500">{formatLKR(grandTotal)}</p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">Drop-off Schedule</p>
                <p className="text-slate-900 font-extrabold text-sm">
                  {booking?.dropoffTime ? new Date(booking.dropoffTime).toLocaleString() : 'As Scheduled'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">Pick-up Schedule</p>
                <p className="text-slate-900 font-extrabold text-sm">
                  {booking?.pickupTime ? new Date(booking.pickupTime).toLocaleString() : 'As Scheduled'}
                </p>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="bg-slate-50 p-4 sm:p-6 border-t border-slate-100 flex items-center justify-between gap-3 print:hidden">
              <Button variant="secondary" size="sm" onClick={handleDownloadQr} className="gap-2">
                <Download className="w-4 h-4" /> Save QR Code
              </Button>
              <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-2">
                <Printer className="w-4 h-4" /> Print Pass
              </Button>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs print:hidden">
            <h3 className="text-xl font-extrabold text-[#1C130E] mb-6">What happens next?</h3>
            <div className="flex flex-col gap-5">
              {[
                { step: '1', icon: <QrCode className="w-4 h-4 text-orange-600"/>, text: 'Present your QR code when you arrive at drop-off.' },
                { step: '2', icon: isCashPayment ? <Banknote className="w-4 h-4 text-amber-600"/> : <CreditCard className="w-4 h-4 text-orange-600"/>, text: isCashPayment ? 'Pay cash on arrival to our staff member.' : 'Our verified staff checks in your items securely.' },
                { step: '3', icon: <ShieldCheck className="w-4 h-4 text-orange-600"/>, text: 'Your items are stored under 24/7 surveillance with $10,000 insurance.' },
                { step: '4', icon: <MapPin className="w-4 h-4 text-orange-600"/>, text: 'Pick up your bags at your scheduled pick-up time.' },
              ].map(({ step, icon, text }) => (
                <div key={step} className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-900 flex-shrink-0 flex items-center justify-center text-xs font-black">
                    {step}
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-900 mt-0.5">
                    <span className="flex-shrink-0">{icon}</span>
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2 print:hidden">
            <Link href="/my-bookings" className="flex-1">
              <Button variant="secondary" fullWidth size="lg">
                View My Reservations
              </Button>
            </Link>
            <Link href="/book" className="flex-1">
              <Button variant="primary" fullWidth size="lg">
                Book Another Storage →
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold">Loading confirmation ticket pass...</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
