import { getOperationalBookings, searchAllBookings } from '@/lib/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/auth/guard';
import { getSettings } from '@/lib/settings';
import { rateLimit } from '@/lib/security/rateLimit';
import { fail, ok, serverError, tooManyRequests, NO_STORE } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export type OpsTask =
  | { kind: 'dropoff'; at: string }
  | { kind: 'pickup'; at: string };

/**
 * GET /api/staff/operations — the operations board.
 *
 * Returns the upcoming work grouped by location and ordered by time, with
 * the customer contact details staff need to call ahead. Every booking
 * produces up to two tasks: a drop-off at its start and a pick-up at its
 * end, which may be at different locations.
 *
 * Staff-level access (not SuperAdmin) — this is the day-to-day tool.
 */
export async function GET(req: Request) {
  try {
    const actor = await requireStaff();

    // Generous but present: this is an authenticated internal tool, but
    // searchAllBookings can pull the whole booking history per request, so
    // a compromised staff session shouldn't be able to script an unbounded
    // customer-data crawl through it.
    if (!rateLimit(`ops:${actor.userId}`, 180, 600_000).allowed) {
      throw tooManyRequests('Too many requests. Please wait a moment.');
    }

    const settings = await getSettings();
    const url = new URL(req.url);
    const windowHours = Math.min(Number(url.searchParams.get('hours')) || settings.ops_window_hours, 720);
    const locationId = url.searchParams.get('locationId') ?? undefined;
    const search = url.searchParams.get('q') ?? undefined;

    const supabase = createAdminClient();
    const { data: locations, error: locErr } = await supabase
      .from('locations')
      .select('id, code, name, is_airport')
      .eq('is_active', true)
      .order('name');

    if (locErr) {
      console.error('[staff.operations] location fetch failed:', locErr);
      throw serverError('We could not load locations.');
    }

    // A search term looks up ANY booking (any status, any date) — the
    // windowed/task view below only ever covers active work, which made a
    // completed or historical booking unfindable from this screen.
    if (search && search.trim()) {
      const searchResults = await searchAllBookings(search, 50);
      return ok(
        {
          searchResults,
          locations: locations ?? [],
          generatedAt: new Date().toISOString(),
        },
        NO_STORE,
      );
    }

    const bookings = await getOperationalBookings({ windowHours, locationId, search });

    const now = Date.now();
    const horizon = now + windowHours * 3600_000;

    /**
     * Flatten bookings into individual timed tasks. A booking dropped off
     * at CMB and collected at the hotel is two separate jobs for two
     * different teams, so the board must show it in both places.
     */
    const tasks = bookings.flatMap((b) => {
      const rows: {
        taskId: string;
        kind: 'dropoff' | 'pickup';
        at: string;
        locationId: string;
        locationName: string;
        booking: typeof b;
      }[] = [];

      const dropAt = new Date(b.dropoffTime).getTime();
      const pickAt = new Date(b.pickupTime).getTime();

      // Show a drop-off until it has actually been deposited.
      const dropPending = b.status === 'confirmed' || b.status === 'in_transit';
      if (dropPending && Number.isFinite(dropAt) && dropAt <= horizon) {
        rows.push({
          taskId: `${b.id}:dropoff`,
          kind: 'dropoff',
          at: b.dropoffTime,
          locationId: b.dropoffLocationId,
          locationName: b.dropoffLocationName,
          booking: b,
        });
      }

      // Show a pick-up once the bags are actually in storage.
      const pickPending = b.status === 'deposited' || b.status === 'in_transit';
      if (pickPending && Number.isFinite(pickAt) && pickAt <= horizon) {
        rows.push({
          taskId: `${b.id}:pickup`,
          kind: 'pickup',
          at: b.pickupTime,
          locationId: b.pickupLocationId,
          locationName: b.pickupLocationName,
          booking: b,
        });
      }

      return rows;
    });

    tasks.sort((a, z) => new Date(a.at).getTime() - new Date(z.at).getTime());

    // Group by location so each site sees only its own queue.
    const byLocation = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const list = byLocation.get(task.locationId);
      if (list) list.push(task);
      else byLocation.set(task.locationId, [task]);
    }

    const groups = (locations ?? [])
      .map((loc) => ({
        location: loc,
        tasks: byLocation.get(loc.id) ?? [],
      }))
      .filter((g) => g.tasks.length > 0 || !locationId);

    return ok(
      {
        groups,
        locations: locations ?? [],
        windowHours,
        generatedAt: new Date().toISOString(),
        counts: {
          total: tasks.length,
          dropoffs: tasks.filter((t) => t.kind === 'dropoff').length,
          pickups: tasks.filter((t) => t.kind === 'pickup').length,
          overdue: tasks.filter((t) => new Date(t.at).getTime() < now).length,
        },
      },
      NO_STORE,
    );
  } catch (err) {
    return fail(err, 'staff.operations.GET');
  }
}
