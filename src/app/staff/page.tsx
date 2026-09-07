'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { formatUSD } from '@/lib/currency';
import { bookingRef } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { notify } from '@/lib/toast';
import { BookingEditForm } from '@/components/admin/BookingEditForm';
import { CashCollectButton } from '@/components/admin/CashCollectButton';
import { PayLinkButton } from '@/components/admin/PayLinkButton';
import { QrScanButton } from '@/components/staff/QrScanButton';
import {
  Box, Plane, MapPin, LogOut, Briefcase, RefreshCw, Phone, MessageCircle,
  Search, Clock, AlertTriangle, PackageCheck, CheckCircle2, User, FileText,
  ChevronDown, ChevronRight, Shield, X, Pencil, SearchX,
} from 'lucide-react';
import type { BookingRecord } from '@/lib/db';

/**
 * Operations Dashboard — redesigned around a single job queue, Uber-driver
 * style: one flat list ordered by time, one obvious primary button per
 * card, no filter toolbar to configure before you can see your work. There
 * used to be a Window/Type/Location filter row plus four summary tiles;
 * staff don't run a report before their shift, they just need the next
 * job — cut entirely rather than tucked away, per explicit client feedback
 * that the board was too complex for day-to-day use.
 *
 * The unit is still a *task*, not a booking: a booking dropped at the
 * airport and collected at a hotel is two jobs for two teams, so it
 * appears twice, once at each of its own times. The server still groups by
 * location (other consumers may want that), this page just flattens it
 * back into one time-ordered list.
 */

type TaskKind = 'dropoff' | 'pickup';
type BookingStatus = BookingRecord['status'];

interface OpsTask {
  taskId: string;
  kind: TaskKind;
  at: string;
  locationId: string;
  locationName: string;
  booking: BookingRecord;
}

interface OpsGroup {
  location: { id: string; code: string; name: string; is_airport: boolean };
  tasks: OpsTask[];
}

/** The action that advances each task kind, given the booking's state. */
const NEXT_ACTION: Record<TaskKind, Partial<Record<BookingStatus, { label: string; next: BookingStatus }>>> = {
  dropoff: {
    confirmed: { label: 'Received', next: 'deposited' },
    in_transit: { label: 'Received', next: 'deposited' },
  },
  pickup: {
    deposited: { label: 'Handed over', next: 'picked_up' },
  },
};

export default function StaffDashboard() {
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [searchResults, setSearchResults] = useState<BookingRecord[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  /**
   * "Now" is captured at fetch time rather than read during render, so
   * overdue styling is a pure function of props and does not drift between
   * a server and client render.
   */
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async (isManual?: boolean) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/staff/operations?${params}`);
      const data = await res.json();

      if (!res.ok) {
        const msg = data?.error ?? 'Could not load the operations board.';
        setError(msg);
        notify.error(msg);
        return;
      }

      if (data.searchResults) {
        setSearchResults(data.searchResults);
        setTasks([]);
      } else {
        setSearchResults(null);
        // Flatten the server's location groups into one time-ordered queue.
        const flat = (data.groups ?? []).flatMap((g: OpsGroup) => g.tasks);
        flat.sort((a: OpsTask, z: OpsTask) => new Date(a.at).getTime() - new Date(z.at).getTime());
        setTasks(flat);
      }
      const syncedAt = data.generatedAt ? new Date(data.generatedAt) : new Date();
      setLastSynced(syncedAt);
      setNowMs(syncedAt.getTime());
      if (isManual) {
        notify.success('Operations dashboard refreshed.');
      }
    } catch {
      const msg = 'Could not reach the server. Check your connection.';
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Debounced so typing in the search box does not fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const setBookingStatus = async (
    bookingId: string,
    busyKey: string,
    next: BookingStatus,
    customerName?: string,
  ) => {
    setBusyTask(busyKey);
    setError('');
    try {
      const res = await fetch(`/api/staff/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingStatus: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error ?? 'Could not update that booking.';
        setError(msg);
        notify.error(msg);
        return;
      }
      const who = customerName ? `${customerName} (${bookingRef(bookingId)})` : bookingRef(bookingId);
      notify.success(`${who} marked as ${next.replace('_', ' ')}.`);
      await load();
    } catch {
      const msg = 'Could not reach the server. The booking was not updated.';
      setError(msg);
      notify.error(msg);
    } finally {
      setBusyTask(null);
    }
  };

  const advance = (task: OpsTask, next: BookingStatus) =>
    setBookingStatus(task.booking.id, task.taskId, next, task.booking.fullName);

  const handleSignOut = async () => {
    notify.info('Signing out...');
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="admin-shell min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-[#1C130E] text-white sticky top-0 z-40 border-b border-stone-800 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Luggage Storage Colombo</span>
              <p className="text-sm font-extrabold text-white leading-none truncate">Operations</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {lastSynced && (
              <span className="hidden sm:inline text-[11px] font-medium text-stone-400 tabular-nums">
                Synced {lastSynced.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => load(true)}
              title="Refresh"
              aria-label="Refresh operations board"
              className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            </button>
            <button
              onClick={handleSignOut}
              id="staff-logout-btn"
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs font-bold text-stone-300 hover:bg-stone-800 hover:text-white transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6">
        {/* Summary tiles */}
        {/* Find a booking — everything else is just the queue below, no setup required */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-6 flex items-center gap-2 shadow-2xs">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a booking — name, phone, reference…"
              aria-label="Search all bookings"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-9 py-3 text-sm font-semibold
                         text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600
                         focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <QrScanButton onScan={(id) => setSearch(id)} />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm font-semibold text-red-800"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss" className="cursor-pointer text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {search.trim() ? (
          loading ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
              ))}
            </div>
          ) : !searchResults || searchResults.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 flex flex-col items-center">
              <SearchX className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-xl font-bold text-slate-900">No bookings found</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Nothing matches &ldquo;{search}&rdquo; by name, phone, email, passport or reference.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {searchResults.map((b) =>
                editingId === b.id ? (
                  <div key={b.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4">
                    <BookingEditForm
                      booking={b}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        load();
                      }}
                    />
                  </div>
                ) : (
                  <SearchResultRow
                    key={b.id}
                    booking={b}
                    expanded={expanded === b.id}
                    onToggle={() => setExpanded(expanded === b.id ? null : b.id)}
                    onEdit={() => setEditingId(b.id)}
                    onSetStatus={(next) => setBookingStatus(b.id, b.id, next, b.fullName)}
                    onRefresh={load}
                    busy={busyTask === b.id}
                  />
                ),
              )}
            </div>
          )
        ) : loading && tasks.length === 0 ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-4" />
            <p className="text-xl font-bold text-slate-900">Nothing scheduled</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">No drop-offs or pick-ups coming up right now.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tasks.map((task) => (
              <TaskRow
                key={task.taskId}
                task={task}
                expanded={expanded === task.taskId}
                onToggle={() => setExpanded(expanded === task.taskId ? null : task.taskId)}
                onAdvance={advance}
                busy={busyTask === task.taskId}
                nowMs={nowMs}
                editing={editingId === task.booking.id}
                onEdit={() => setEditingId(task.booking.id)}
                onEditSaved={() => {
                  setEditingId(null);
                  load();
                }}
                onEditCancel={() => setEditingId(null)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Task row ────────────────────────────────────────────────────────────

function TaskRow({
  task,
  expanded,
  onToggle,
  onAdvance,
  busy,
  nowMs,
  editing,
  onEdit,
  onEditSaved,
  onEditCancel,
}: {
  task: OpsTask;
  expanded: boolean;
  onToggle: () => void;
  onAdvance: (task: OpsTask, next: BookingStatus) => void;
  busy: boolean;
  /** Reference time captured at fetch, so render stays a pure function. */
  nowMs: number;
  editing: boolean;
  onEdit: () => void;
  onEditSaved: () => void;
  onEditCancel: () => void;
}) {
  const { booking } = task;
  const at = new Date(task.at);
  const overdue = at.getTime() < nowMs;
  const action = NEXT_ACTION[task.kind][booking.status];
  // Bags don't leave with a balance still owed — collect it (cash or pay
  // link, both already visible above) before this button unlocks.
  const blockedByBalance = task.kind === 'pickup' && booking.balanceDueUsd > 0;

  const itemSummary =
    booking.items.length > 0
      ? booking.items.map((i) => `${i.qty}× ${i.tierName ?? 'item'}`).join(', ')
      : 'No items recorded';

  const telHref = `tel:${booking.phone.replace(/[^\d+]/g, '')}`;
  const waHref = `https://wa.me/${booking.phone.replace(/\D/g, '')}`;

  if (editing) {
    return (
      <article className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4">
        <BookingEditForm booking={booking} onCancel={onEditCancel} onSaved={onEditSaved} />
      </article>
    );
  }

  return (
    <article
      className={[
        'bg-white rounded-2xl border shadow-2xs transition-colors',
        overdue ? 'border-red-300' : 'border-slate-200',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Time column — the thing staff scan down */}
        <div className="flex flex-col items-center flex-shrink-0 w-14 pt-0.5">
          <span className={['text-base font-extrabold tabular-nums', overdue ? 'text-red-600' : 'text-slate-900'].join(' ')}>
            {at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase">
            {at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </span>
        </div>

        <div className="w-px self-stretch bg-slate-100" aria-hidden="true" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={[
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                task.kind === 'dropoff' ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800',
              ].join(' ')}
            >
              {task.kind === 'dropoff' ? <Box className="w-3 h-3" /> : <PackageCheck className="w-3 h-3" />}
              {task.kind === 'dropoff' ? 'Drop-off' : 'Pick-up'}
            </span>

            {overdue && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 uppercase">
                Overdue
              </span>
            )}

            {booking.paymentStatus !== 'paid' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                Collect {formatUSD(booking.balanceDueUsd)}
              </span>
            )}
          </div>

          <p className="text-sm font-extrabold text-slate-900 truncate">{booking.fullName || 'Guest'}</p>
          <p className="text-xs font-medium text-slate-500 truncate">{task.locationName} · {itemSummary}</p>
        </div>
      </div>

      {/* Quick actions — always visible, no expand needed to reach them */}
      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        <a
          href={telHref}
          aria-label={`Call ${booking.fullName || 'customer'}`}
          title={booking.phone}
          className="w-11 h-11 rounded-full bg-slate-100 hover:bg-orange-100 text-slate-700 hover:text-orange-700
                     flex items-center justify-center transition-colors flex-shrink-0"
        >
          <Phone className="w-5 h-5" />
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${booking.fullName || 'customer'}`}
          className="w-11 h-11 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700
                     flex items-center justify-center transition-colors flex-shrink-0"
        >
          <MessageCircle className="w-5 h-5" />
        </a>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
        >
          <Pencil className="w-4 h-4" /> Edit / Extend
        </button>
        <CashCollectButton booking={booking} onCollected={onEditSaved} />
        <PayLinkButton booking={booking} onPaid={onEditSaved} />
      </div>

      {/* One big primary action — the button staff reach for the most */}
      {action && (
        <div className="px-4 pb-4">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={blockedByBalance}
            onClick={() => onAdvance(task, action.next)}
            id={`advance-${task.taskId}`}
            className="text-base font-extrabold py-4"
          >
            {blockedByBalance ? `Collect ${formatUSD(booking.balanceDueUsd)} first` : action.label}
          </Button>
        </div>
      )}

      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 border-t border-slate-100 cursor-pointer transition-colors"
      >
        {expanded ? 'Hide details' : 'More details'}
        <ChevronDown className={['w-3.5 h-3.5 transition-transform', expanded ? 'rotate-180' : ''].join(' ')} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs mb-4">
            <Detail icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={booking.phone} mono />
            <Detail icon={<User className="w-3.5 h-3.5" />} label="Reference" value={bookingRef(booking.id)} title={booking.id} mono />
            <Detail icon={<FileText className="w-3.5 h-3.5" />} label="Passport Number" value={booking.passportNo || '—'} mono />
            <Detail icon={<Plane className="w-3.5 h-3.5" />} label="Flight #" value={booking.flightNumber || '—'} />
            <Detail
              icon={<Shield className="w-3.5 h-3.5" />}
              label="Insurance"
              value={booking.insuranceEnabled ? `Yes — ${formatUSD(booking.insuranceTotalUsd)}` : 'No'}
            />
            <Detail icon={<Box className="w-3.5 h-3.5" />} label="Drop-off site" value={booking.dropoffLocationName} />
            <Detail icon={<Box className="w-3.5 h-3.5" />} label="Pick-up site" value={booking.pickupLocationName} />
            <Detail
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Payment"
              value={paymentSummary(booking)}
            />
            <Detail icon={<Clock className="w-3.5 h-3.5" />} label="Duration" value={`${booking.durationDays} day(s)`} />
          </dl>

          {booking.notes && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Customer note</p>
              <p className="text-xs font-medium text-amber-950">{booking.notes}</p>
            </div>
          )}

          <ul className="flex flex-col gap-1">
            {booking.items.map((item, i) => (
              <li key={`${item.tierId}-${i}`} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  {item.iconEmoji} {item.qty}× {item.tierName ?? item.tierId}
                </span>
                <span className="font-bold text-slate-900 tabular-nums">{formatUSD(item.lineTotalUsd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

// ── Search result row (any booking, any status/date) ────────────────────

const STATUS_OPTIONS: BookingStatus[] = ['confirmed', 'in_transit', 'deposited', 'picked_up', 'cancelled'];

function SearchResultRow({
  booking,
  expanded,
  onToggle,
  onEdit,
  onSetStatus,
  onRefresh,
  busy,
}: {
  booking: BookingRecord;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSetStatus: (next: BookingStatus) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const telHref = `tel:${booking.phone.replace(/[^\d+]/g, '')}`;
  const waHref = `https://wa.me/${booking.phone.replace(/\D/g, '')}`;

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-2xs">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 capitalize">
              {booking.status.replace('_', ' ')}
            </span>
            {booking.isAirportBooking && <Plane className="w-3.5 h-3.5 text-slate-400" />}
            {booking.paymentStatus !== 'paid' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                Collect {formatUSD(booking.balanceDueUsd)}
              </span>
            )}
          </div>
          <p className="text-sm font-extrabold text-slate-900 truncate">{booking.fullName || 'Guest'}</p>
          <p className="text-xs font-medium text-slate-500 truncate">
            {booking.phone} · {booking.dropoffLocationName} → {booking.pickupLocationName}
          </p>
        </div>
        <span className="text-slate-400 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        <a
          href={telHref}
          aria-label="Call"
          className="w-11 h-11 rounded-full bg-slate-100 hover:bg-orange-100 text-slate-700 hover:text-orange-700 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <Phone className="w-5 h-5" />
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          className="w-11 h-11 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <MessageCircle className="w-5 h-5" />
        </a>
        <button onClick={onEdit} className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer">
          <Pencil className="w-4 h-4" /> Edit / Extend
        </button>
        <CashCollectButton booking={booking} onCollected={onRefresh} />
        <PayLinkButton booking={booking} onPaid={onRefresh} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs mb-4 mt-3">
            <Detail icon={<User className="w-3.5 h-3.5" />} label="Reference" value={bookingRef(booking.id)} title={booking.id} mono />
            <Detail icon={<FileText className="w-3.5 h-3.5" />} label="Passport Number" value={booking.passportNo || '—'} mono />
            <Detail icon={<Plane className="w-3.5 h-3.5" />} label="Flight #" value={booking.flightNumber || '—'} />
            <Detail icon={<Box className="w-3.5 h-3.5" />} label="Drop-off" value={`${booking.dropoffLocationName} · ${new Date(booking.dropoffTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`} />
            <Detail icon={<MapPin className="w-3.5 h-3.5" />} label="Pick-up" value={`${booking.pickupLocationName} · ${new Date(booking.pickupTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`} />
            <Detail icon={<Clock className="w-3.5 h-3.5" />} label="Payment" value={paymentSummary(booking)} />
            <Detail icon={<Shield className="w-3.5 h-3.5" />} label="Insurance" value={booking.insuranceEnabled ? `Yes — ${formatUSD(booking.insuranceTotalUsd)}` : 'No'} />
          </dl>

          {booking.notes && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Customer note</p>
              <p className="text-xs font-medium text-amber-950">{booking.notes}</p>
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
            {STATUS_OPTIONS.map((st) => {
              const blocked = st === 'picked_up' && booking.balanceDueUsd > 0;
              return (
                <button
                  key={st}
                  disabled={busy || booking.status === st || blocked}
                  title={blocked ? `Collect ${formatUSD(booking.balanceDueUsd)} before marking picked up` : undefined}
                  onClick={() => onSetStatus(st)}
                  className={[
                    'px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer',
                    booking.status === st
                      ? 'bg-slate-900 text-white cursor-default'
                      : 'bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-40',
                  ].join(' ')}
                >
                  {st.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

// ── Small presentational pieces ─────────────────────────────────────────

function paymentSummary(booking: BookingRecord): string {
  const method = booking.paymentMethod === 'stripe' ? 'Card' : 'Cash';
  if (booking.balanceDueUsd <= 0) return `${method} — paid (${formatUSD(booking.grandTotalUsd)})`;
  if (booking.amountPaidUsd > 0) {
    return `${method} — ${formatUSD(booking.balanceDueUsd)} due (${formatUSD(booking.amountPaidUsd)} paid of ${formatUSD(booking.grandTotalUsd)})`;
  }
  return `${method} — ${formatUSD(booking.grandTotalUsd)} due`;
}

function Detail({
  icon, label, value, mono, title,
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</dt>
        <dd
          title={title}
          className={['font-semibold text-slate-900 break-words', mono ? 'font-mono text-[11px]' : ''].join(' ')}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

