import { listBookings } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { fail, ok, NO_STORE } from '@/lib/api/http';
import type { BookingRecord } from '@/lib/db';
import type { PaymentStatus } from '@/lib/locations';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['confirmed', 'in_transit', 'deposited', 'picked_up', 'cancelled']);
const PAYMENT_STATUSES = new Set(['pending', 'partially_paid', 'paid', 'failed']);

/**
 * GET /api/admin/bookings — paginated booking browser for the admin panel.
 * SuperAdmin only: the response carries full customer contact details.
 */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin();

    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status');
    const paymentParam = url.searchParams.get('paymentStatus');

    const { bookings, total } = await listBookings({
      status: statusParam && STATUSES.has(statusParam) ? (statusParam as BookingRecord['status']) : undefined,
      paymentStatus:
        paymentParam && PAYMENT_STATUSES.has(paymentParam) ? (paymentParam as PaymentStatus) : undefined,
      search: url.searchParams.get('q') ?? undefined,
      limit: Number(url.searchParams.get('limit')) || 50,
      offset: Number(url.searchParams.get('offset')) || 0,
    });

    return ok({ bookings, total }, NO_STORE);
  } catch (err) {
    return fail(err, 'admin.bookings.GET');
  }
}
