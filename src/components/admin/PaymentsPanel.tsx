'use client';

import React, { useState, useCallback } from 'react';
import { formatUSD } from '@/lib/currency';
import { paymentsApi, AdminApiError } from '@/lib/admin/api';
import { notify } from '@/lib/toast';
import { PanelHeader, ErrorBanner, EmptyState, useDeferredLoad } from './primitives';
import { CreditCard, Banknote, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaymentEntry, PaymentTotals } from '@/lib/db';

const PAGE_SIZE = 25;

/**
 * The financial view: every payment ledger entry (cash collections and
 * settled Stripe charges) plus today/week/all-time totals. This is what
 * "does the payments table also give us a financial dashboard" turns
 * into — read-only, since the ledger is written exclusively by
 * recordPayment() in db.ts, never edited by hand here.
 */
export function PaymentsPanel() {
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [totals, setTotals] = useState<PaymentTotals | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await paymentsApi.list({ method, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setPayments(data.payments);
      setTotal(data.total);
      setTotals(data.totals);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'Could not load payments.';
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  }, [method, status, page]);

  useDeferredLoad(load);

  const applyMethod = (v: string) => {
    setMethod(v);
    setPage(0);
  };
  const applyStatus = (v: string) => {
    setStatus(v);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PanelHeader title="Payments" description="Every cash collection and settled card charge, in one ledger." />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatTile label="Today" value={formatUSD(totals?.todayUsd ?? 0)} />
        <StatTile label="Last 7 days" value={formatUSD(totals?.weekUsd ?? 0)} />
        <StatTile label="All time" value={formatUSD(totals?.allTimeUsd ?? 0)} />
        <StatTile
          label="Today — cash / card"
          value={`${formatUSD(totals?.todayByMethod.cash ?? 0)} / ${formatUSD(totals?.todayByMethod.stripe ?? 0)}`}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-5 flex flex-wrap items-center gap-2 shadow-2xs">
        <Chip active={!method} onClick={() => applyMethod('')}>All methods</Chip>
        <Chip active={method === 'cash'} onClick={() => applyMethod('cash')}>Cash</Chip>
        <Chip active={method === 'stripe'} onClick={() => applyMethod('stripe')}>Card</Chip>
        <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />
        <Chip active={!status} onClick={() => applyStatus('')}>All statuses</Chip>
        <Chip active={status === 'succeeded'} onClick={() => applyStatus('succeeded')}>Succeeded</Chip>
        <Chip active={status === 'pending'} onClick={() => applyStatus('pending')}>Pending</Chip>
        <Chip active={status === 'failed'} onClick={() => applyStatus('failed')}>Failed</Chip>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState title="No payments match" hint="Try clearing the filters." />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs px-4 py-3 flex items-center gap-3"
              >
                <span
                  className={[
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                    p.method === 'stripe' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700',
                  ].join(' ')}
                >
                  {p.method === 'stripe' ? <CreditCard className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-slate-900 truncate">
                    {p.customerName} <span className="text-slate-400 font-mono text-[11px]">{p.bookingRef}</span>
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {new Date(p.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {p.collectedByName ? ` · collected by ${p.collectedByName}` : ''}
                  </p>
                </div>

                <span
                  className={[
                    'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0',
                    p.status === 'succeeded'
                      ? 'bg-emerald-100 text-emerald-800'
                      : p.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800',
                  ].join(' ')}
                >
                  {p.status}
                </span>

                <span className="text-sm font-extrabold text-slate-900 tabular-nums flex-shrink-0 w-20 text-right">
                  {formatUSD(p.amountUsd)}
                </span>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3 mt-5" aria-label="Payment pages">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
                           bg-white border border-slate-200 text-slate-700 hover:bg-slate-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <span className="text-xs font-bold text-slate-500 tabular-nums">Page {page + 1} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
                           bg-white border border-slate-200 text-slate-700 hover:bg-slate-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xl font-extrabold text-slate-900 tabular-nums truncate">{value}</p>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
        active ? 'bg-[#1C130E] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
