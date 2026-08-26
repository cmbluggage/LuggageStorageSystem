import { getBookingById, updateBookingDetails } from '@/lib/db';
import { requireStaff } from '@/lib/auth/guard';
import { writeAudit, redact } from '@/lib/audit';
import { parseBody, bookingEditSchema, idSchema } from '@/lib/validation/schemas';
import { badRequest, fail, notFound, ok, tooManyRequests, clientIp, NO_STORE } from '@/lib/api/http';
import { rateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/staff/bookings/[id]/details — edit customer details, notes,
 * or schedule (location + time) on an existing booking.
 *
 * Kept separate from the status-transition PATCH in the parent route so
 * that well-tested endpoint stays untouched. Both staff and SuperAdmin can
 * use this — it's an operational correction, not a pricing-policy change.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff();

    const ip = clientIp(req);
    if (!rateLimit(`booking-edit:${actor.userId}:${ip}`, 60, 600_000).allowed) {
      throw tooManyRequests('Too many edits. Please wait a moment.');
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const patch = await parseBody(req, bookingEditSchema);

    const current = await getBookingById(id);
    if (!current) throw notFound('Booking not found.');

    const { booking: updated, balanceNowDue } = await updateBookingDetails(id, patch);

    await writeAudit({
      tableName: 'bookings',
      recordId: id,
      action: 'UPDATE',
      summary: `Booking details edited by ${actor.email}${balanceNowDue ? ' (balance now due after re-pricing)' : ''}`,
      actor,
      oldValues: redact({
        fullName: current.fullName,
        email: current.email,
        notes: current.notes,
        dropoffLocationId: current.dropoffLocationId,
        pickupLocationId: current.pickupLocationId,
        dropoffTime: current.dropoffTime,
        pickupTime: current.pickupTime,
        grandTotalUsd: current.grandTotalUsd,
        paymentStatus: current.paymentStatus,
      }),
      newValues: redact({
        fullName: updated.fullName,
        email: updated.email,
        notes: updated.notes,
        dropoffLocationId: updated.dropoffLocationId,
        pickupLocationId: updated.pickupLocationId,
        dropoffTime: updated.dropoffTime,
        pickupTime: updated.pickupTime,
        grandTotalUsd: updated.grandTotalUsd,
        paymentStatus: updated.paymentStatus,
      }),
    });

    return ok({ booking: updated, balanceNowDue }, NO_STORE);
  } catch (err) {
    return fail(err, 'staff.bookings.details.PATCH');
  }
}
