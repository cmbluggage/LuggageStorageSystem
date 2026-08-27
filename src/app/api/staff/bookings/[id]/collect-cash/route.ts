import { getBookingById, markCashCollected } from '@/lib/db';
import { requireStaff } from '@/lib/auth/guard';
import { writeAudit } from '@/lib/audit';
import { badRequest, fail, notFound, ok, tooManyRequests, clientIp, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';
import { idSchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/staff/bookings/[id]/collect-cash — mark a cash booking's
 * payment as physically collected.
 *
 * Separate from the details-edit and status-transition endpoints because
 * this is a distinct real-world event (money changing hands) that needs
 * its own attribution (who collected it, when) for reconciliation — see
 * `markCashCollected` in db.ts.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff();

    const ip = clientIp(req);
    if (!rateLimit(`collect-cash:${actor.userId}:${ip}`, 60, 600_000).allowed) {
      throw tooManyRequests('Too many requests. Please wait a moment.');
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const current = await getBookingById(id);
    if (!current) throw notFound('Booking not found.');

    const updated = await markCashCollected(id, actor.userId);

    await writeAudit({
      tableName: 'bookings',
      recordId: id,
      action: 'UPDATE',
      summary: `Cash collected by ${actor.email} (${current.grandTotalUsd.toFixed(2)} USD)`,
      actor,
      oldValues: { paymentStatus: current.paymentStatus },
      newValues: { paymentStatus: updated.paymentStatus, cashCollectedByName: updated.cashCollectedByName },
    });

    return ok({ booking: updated }, NO_STORE);
  } catch (err) {
    return fail(err, 'staff.bookings.collectCash.PATCH');
  }
}
