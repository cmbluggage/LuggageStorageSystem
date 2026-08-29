import { listPayments, getPaymentTotals } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { fail, ok, NO_STORE } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

const METHODS = new Set(['cash', 'stripe']);
const STATUSES = new Set(['pending', 'succeeded', 'failed', 'refunded']);

/**
 * GET /api/admin/payments — the financial view: every ledger entry plus
 * today/week/all-time totals. SuperAdmin only, same as the bookings
 * browser this sits alongside.
 */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin();

    const url = new URL(req.url);
    const methodParam = url.searchParams.get('method');
    const statusParam = url.searchParams.get('status');

    const [{ payments, total }, totals] = await Promise.all([
      listPayments({
        method: methodParam && METHODS.has(methodParam) ? (methodParam as 'cash' | 'stripe') : undefined,
        status: statusParam && STATUSES.has(statusParam) ? (statusParam as never) : undefined,
        limit: Number(url.searchParams.get('limit')) || 50,
        offset: Number(url.searchParams.get('offset')) || 0,
      }),
      getPaymentTotals(),
    ]);

    return ok({ payments, total, totals }, NO_STORE);
  } catch (err) {
    return fail(err, 'admin.payments.GET');
  }
}
