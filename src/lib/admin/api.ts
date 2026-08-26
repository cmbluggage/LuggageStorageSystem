import type { AppSettingRow, ItemTierRow, LocationRow, AddonRow, TimeSlotRow } from '@/lib/supabase/types';
import type { BookingRecord } from '@/lib/db';

/**
 * Typed client for the admin API.
 *
 * The admin panel used to call Supabase directly from the browser with the
 * anon key, which only worked because RLS was wide open. Every mutation now
 * goes through a route handler that checks the session, so this module is
 * the single place that knows those URLs and their error shape.
 */

export class AdminApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new AdminApiError('Could not reach the server. Check your connection.', 0);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // The session expired mid-edit — say so plainly rather than showing
    // a generic failure the operator cannot act on.
    if (res.status === 401) {
      throw new AdminApiError('Your session has expired. Please sign in again.', 401);
    }
    if (res.status === 403) {
      throw new AdminApiError('This action requires SuperAdmin access.', 403);
    }
    throw new AdminApiError(data?.error ?? 'Something went wrong.', res.status, data?.details);
  }

  return data as T;
}

// ── Settings ─────────────────────────────────────────────────────

export const settingsApi = {
  list: () => request<{ settings: AppSettingRow[] }>('/api/admin/settings'),
  update: (settings: Record<string, string | number | boolean>) =>
    request<{ settings: Record<string, unknown> }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    }),
};

// ── Catalog ──────────────────────────────────────────────────────

function catalogApi<Row, Create, Update>(path: string, key: string) {
  return {
    /** `all` includes deactivated rows (SuperAdmin only). */
    list: (all = true) =>
      request<Record<string, Row[]>>(`${path}${all ? '?all=1' : ''}`).then((d) => d[key] ?? []),
    create: (payload: Create) =>
      request<Record<string, Row>>(path, { method: 'POST', body: JSON.stringify(payload) }),
    update: (payload: Update) =>
      request<Record<string, Row>>(path, { method: 'PATCH', body: JSON.stringify(payload) }),
    archive: (id: string) =>
      request<{ archived: string }>(`${path}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}

export type ItemTierInput = Omit<ItemTierRow, 'id' | 'created_at' | 'updated_at'>;
export type LocationInput = Omit<LocationRow, 'id' | 'created_at' | 'updated_at'>;
export type AddonInput = Omit<AddonRow, 'id' | 'created_at' | 'updated_at'>;

export const itemTiersApi = catalogApi<ItemTierRow, ItemTierInput, Partial<ItemTierInput> & { id: string }>(
  '/api/item-tiers',
  'item_tiers',
);

export const locationsApi = catalogApi<LocationRow, LocationInput, Partial<LocationInput> & { id: string }>(
  '/api/locations',
  'locations',
);

export const addonsApi = catalogApi<AddonRow, AddonInput, Partial<AddonInput> & { id: string }>(
  '/api/addons',
  'addon_services',
);

// ── Time slots ───────────────────────────────────────────────────

export type TimeSlotInput = Omit<TimeSlotRow, 'created_at'> & { id?: string };

export const timeSlotsApi = {
  list: () => request<{ timeSlots: TimeSlotRow[] }>('/api/time-slots').then((d) => d.timeSlots),
  replace: (timeSlots: TimeSlotInput[]) =>
    request<{ timeSlots: TimeSlotRow[] }>('/api/time-slots', {
      method: 'PUT',
      body: JSON.stringify({ timeSlots }),
    }),
};

// ── Bookings & audit ─────────────────────────────────────────────

export interface BookingQuery {
  status?: string;
  paymentStatus?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export const bookingsApi = {
  list: (query: BookingQuery = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    return request<{ bookings: BookingRecord[]; total: number }>(`/api/admin/bookings?${params}`);
  },
  setStatus: (id: string, bookingStatus: string, cancelReason?: string) =>
    request<{ booking: BookingRecord }>(`/api/staff/bookings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ bookingStatus, cancelReason }),
    }),
  updateDetails: (id: string, patch: Record<string, unknown>) =>
    request<{ booking: BookingRecord; balanceNowDue: boolean }>(`/api/staff/bookings/${id}/details`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  search: (q: string) =>
    request<{ searchResults: BookingRecord[] }>(`/api/staff/operations?q=${encodeURIComponent(q)}`),
};

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor: string;
  summary: string;
  created_at: string;
}

export const auditApi = {
  list: (limit = 100) => request<{ auditLogs: AuditEntry[] }>(`/api/audit-log?limit=${limit}`),
};
