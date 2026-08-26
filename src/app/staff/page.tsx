'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { formatUSD } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import { notify } from '@/lib/toast';
import {
  Box, Plane, MapPin, LogOut, Briefcase, RefreshCw, Phone, MessageCircle,
  Search, Clock, AlertTriangle, PackageCheck, CheckCircle2, User, FileText,
  ChevronDown, ChevronRight, Shield, X,
} from 'lucide-react';
import type { BookingRecord } from '@/lib/db';

/**
 * Operations Dashboard — rebuilt.
 *
 * The previous version listed whole bookings under three ad-hoc tabs and
 * seeded itself with hardcoded demo records, so an empty database looked
 * like a busy day. It also wrote booking_status straight to Supabase from
 * the browser with no validation.
 *
 * The unit here is a *task*, not a booking: a booking dropped at the
 * airport and collected at a hotel is two jobs for two teams, so it
 * appears in both queues at its own time. Tasks are grouped by location
 * and ordered by time, with the contact details staff need to call ahead.
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

interface OpsLocation {
  id: string;
  code: string;
  name: string;
  is_airport: boolean;
}

interface OpsGroup {
  location: OpsLocation;
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

const WINDOW_OPTIONS = [
  { hours: 12, label: '12h' },
  { hours: 24, label: '24h' },
  { hours: 48, label: '48h' },
  { hours: 168, label: '7 days' },
];

export default function StaffDashboard() {
  const [groups, setGroups] = useState<OpsGroup[]>([]);
  const [locations, setLocations] = useState<OpsLocation[]>([]);
  const [counts, setCounts] = useState({ total: 0, dropoffs: 0, pickups: 0, overdue: 0 });

  const [windowHours, setWindowHours] = useState(48);
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<TaskKind | 'all'>('all');
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
      const params = new URLSearchParams({ hours: String(windowHours) });
      if (locationFilter) params.set('locationId', locationFilter);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/staff/operations?${params}`);
      const data = await res.json();

      if (!res.ok) {
        const msg = data?.error ?? 'Could not load the operations board.';
        setError(msg);
        notify.error(msg);
        return;
      }

      setGroups(data.groups ?? []);
      setLocations(data.locations ?? []);
      setCounts(data.counts ?? { total: 0, dropoffs: 0, pickups: 0, overdue: 0 });
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
  }, [windowHours, locationFilter, search]);

  // Debounced so typing in the search box does not fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const advance = async (task: OpsTask, next: BookingStatus) => {
    setBusyTask(task.taskId);
    setError('');
    try {
      const res = await fetch(`/api/staff/bookings/${task.booking.id}`, {
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
      notify.success(`Booking #${task.booking.id.slice(-6)} marked as ${next.replace('_', ' ')}.`);
      await load();
    } catch {
      const msg = 'Could not reach the server. The booking was not updated.';
      setError(msg);
      notify.error(msg);
    } finally {
      setBusyTask(null);
    }
  };

  const handleSignOut = async () => {
    notify.info('Signing out...');
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          tasks: kindFilter === 'all' ? g.tasks : g.tasks.filter((t) => t.kind === kindFilter),
        }))
        .filter((g) => g.tasks.length > 0),
    [groups, kindFilter],
  );

  const visibleCount = visibleGroups.reduce((n, g) => n + g.tasks.length, 0);

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatTile label="Jobs in window" value={counts.total} icon={<Clock className="w-4 h-4" />} />
          <StatTile label="Drop-offs" value={counts.dropoffs} icon={<Box className="w-4 h-4" />} />
          <StatTile label="Pick-ups" value={counts.pickups} icon={<PackageCheck className="w-4 h-4" />} />
          <StatTile
            label="Overdue"
            value={counts.overdue}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={counts.overdue > 0 ? 'alert' : 'default'}
          />
        </div>

        {/* Controls */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-6 flex flex-col gap-3 shadow-2xs">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or booking reference…"
              aria-label="Search bookings"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold
                         text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-600
                         focus:bg-white focus:ring-2 focus:ring-orange-600/20 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup label="Window">
              {WINDOW_OPTIONS.map((o) => (
                <Chip key={o.hours} active={windowHours === o.hours} onClick={() => setWindowHours(o.hours)}>
                  {o.label}
                </Chip>
              ))}
            </FilterGroup>

            <span className="hidden sm:block w-px h-6 bg-slate-200" aria-hidden="true" />

            <FilterGroup label="Type">
              <Chip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>All</Chip>
              <Chip active={kindFilter === 'dropoff'} onClick={() => setKindFilter('dropoff')}>Drop-offs</Chip>
              <Chip active={kindFilter === 'pickup'} onClick={() => setKindFilter('pickup')}>Pick-ups</Chip>
            </FilterGroup>

            {locations.length > 1 && (
              <>
                <span className="hidden sm:block w-px h-6 bg-slate-200" aria-hidden="true" />
                <FilterGroup label="Location">
                  <Chip active={!locationFilter} onClick={() => setLocationFilter('')}>All sites</Chip>
                  {locations.map((l) => (
                    <Chip key={l.id} active={locationFilter === l.id} onClick={() => setLocationFilter(l.id)}>
                      {l.code}
                    </Chip>
                  ))}
                </FilterGroup>
              </>
            )}
          </div>
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

        {loading && groups.length === 0 ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : visibleCount === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-4" />
            <p className="text-xl font-bold text-slate-900">Nothing scheduled</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              No drop-offs or pick-ups match these filters in the next{' '}
              {windowHours >= 24 ? `${Math.round(windowHours / 24)} day(s)` : `${windowHours} hours`}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {visibleGroups.map((group) => (
              <section key={group.location.id} aria-labelledby={`loc-${group.location.id}`}>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <span
                    className={[
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      group.location.is_airport ? 'bg-[#1C130E] text-orange-400' : 'bg-orange-100 text-orange-700',
                    ].join(' ')}
                  >
                    {group.location.is_airport ? <Plane className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  </span>
                  <h2 id={`loc-${group.location.id}`} className="text-base font-extrabold text-slate-900">
                    {group.location.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold tabular-nums">
                    {group.tasks.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.taskId}
                      task={task}
                      expanded={expanded === task.taskId}
                      onToggle={() => setExpanded(expanded === task.taskId ? null : task.taskId)}
                      onAdvance={advance}
                      busy={busyTask === task.taskId}
                      nowMs={nowMs}
                    />
                  ))}
                </div>
              </section>
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
}: {
  task: OpsTask;
  expanded: boolean;
  onToggle: () => void;
  onAdvance: (task: OpsTask, next: BookingStatus) => void;
  busy: boolean;
  /** Reference time captured at fetch, so render stays a pure function. */
  nowMs: number;
}) {
  const { booking } = task;
  const at = new Date(task.at);
  const overdue = at.getTime() < nowMs;
  const action = NEXT_ACTION[task.kind][booking.status];

  const itemSummary =
    booking.items.length > 0
      ? booking.items.map((i) => `${i.qty}× ${i.tierName ?? 'item'}`).join(', ')
      : 'No items recorded';

  const telHref = `tel:${booking.phone.replace(/[^\d+]/g, '')}`;
  const waHref = `https://wa.me/${booking.phone.replace(/\D/g, '')}`;

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

            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 capitalize">
              {booking.status.replace('_', ' ')}
            </span>

            {overdue && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 uppercase">
                Overdue
              </span>
            )}

            {booking.paymentStatus !== 'paid' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                Collect {formatUSD(booking.grandTotalUsd)}
              </span>
            )}
          </div>

          <p className="text-sm font-extrabold text-slate-900 truncate">{booking.fullName || 'Guest'}</p>
          <p className="text-xs font-medium text-slate-500 truncate">{itemSummary}</p>
        </div>

        {/* Contact — the reason staff open this screen */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a
            href={telHref}
            aria-label={`Call ${booking.fullName || 'customer'}`}
            title={booking.phone}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-orange-100 text-slate-700 hover:text-orange-700
                       flex items-center justify-center transition-colors"
          >
            <Phone className="w-4 h-4" />
          </a>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${booking.fullName || 'customer'}`}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700
                       flex items-center justify-center transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
          </a>
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label="Toggle booking details"
            className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center
                       transition-colors cursor-pointer"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 mt-1">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs mb-4">
            <Detail icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={booking.phone} mono />
            <Detail icon={<User className="w-3.5 h-3.5" />} label="Reference" value={booking.id} mono />
            <Detail icon={<FileText className="w-3.5 h-3.5" />} label="Passport / NIC" value={booking.passportNo || '—'} mono />
            <Detail
              icon={<Shield className="w-3.5 h-3.5" />}
              label="Insurance"
              value={booking.insuranceEnabled ? `Yes — ${formatUSD(booking.insuranceTotalUsd)}` : 'No'}
            />
            <Detail icon={<Box className="w-3.5 h-3.5" />} label="Drop-off site" value={booking.dropoffLocationName} />
            <Detail icon={<MapPin className="w-3.5 h-3.5" />} label="Pick-up site" value={booking.pickupLocationName} />
            <Detail
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Payment"
              value={`${booking.paymentMethod === 'stripe' ? 'Card' : 'Cash'} — ${booking.paymentStatus} (${formatUSD(booking.grandTotalUsd)})`}
            />
            <Detail icon={<Clock className="w-3.5 h-3.5" />} label="Duration" value={`${booking.durationDays} day(s)`} />
          </dl>

          {booking.notes && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Customer note</p>
              <p className="text-xs font-medium text-amber-950">{booking.notes}</p>
            </div>
          )}

          <ul className="flex flex-col gap-1 mb-4">
            {booking.items.map((item, i) => (
              <li key={`${item.tierId}-${i}`} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  {item.iconEmoji} {item.qty}× {item.tierName ?? item.tierId}
                </span>
                <span className="font-bold text-slate-900 tabular-nums">{formatUSD(item.lineTotalUsd)}</span>
              </li>
            ))}
          </ul>

          {action && (
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => onAdvance(task, action.next)}
              id={`advance-${task.taskId}`}
            >
              {action.label}
            </Button>
          )}
        </div>
      )}

      {/* Collapsed primary action, so the common case is one tap */}
      {!expanded && action && (
        <div className="px-4 pb-3 -mt-1 flex justify-end">
          <Button variant="primary" size="sm" loading={busy} onClick={() => onAdvance(task, action.next)}>
            {action.label}
          </Button>
        </div>
      )}
    </article>
  );
}

// ── Small presentational pieces ─────────────────────────────────────────

function Detail({
  icon, label, value, mono,
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</dt>
        <dd className={['font-semibold text-slate-900 break-words', mono ? 'font-mono text-[11px]' : ''].join(' ')}>
          {value}
        </dd>
      </div>
    </div>
  );
}

function StatTile({
  label, value, icon, tone = 'default',
}: { label: string; value: number; icon: React.ReactNode; tone?: 'default' | 'alert' }) {
  return (
    <div
      className={[
        'rounded-2xl border p-4 flex items-center gap-3',
        tone === 'alert' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200',
      ].join(' ')}
    >
      <span
        className={[
          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
          tone === 'alert' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700',
        ].join(' ')}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={['text-xl font-extrabold tabular-nums', tone === 'alert' ? 'text-red-700' : 'text-slate-900'].join(' ')}>
          {value}
        </p>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-0.5">{label}</span>
      {children}
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
