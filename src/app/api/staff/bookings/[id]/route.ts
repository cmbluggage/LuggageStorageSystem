import { getBookingById, updateBookingStatus } from '@/lib/db';
import { requireStaff } from '@/lib/auth/guard';
import { writeAudit } from '@/lib/audit';
import { sendStatusUpdateEmail, sendBookingCancelledEmail } from '@/lib/email';
import { parseBody, bookingStatusSchema, idSchema } from '@/lib/validation/schemas';
import { badRequest, fail, notFound, ok, NO_STORE } from '@/lib/api/http';
import type { BookingRecord } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Legal booking status transitions.
 *
 * The staff dashboard previously wrote booking_status straight to Supabase
 * from the browser with no validation, so any status could be set from any
 * other — including reviving a cancelled booking or marking something
 * picked up that had never been deposited.
 */
const ALLOWED_TRANSITIONS: Record<BookingRecord['status'], BookingRecord['status'][]> = {
  confirmed: ['in_transit', 'deposited', 'cancelled'],
  in_transit: ['deposited', 'cancelled'],
  deposited: ['picked_up', 'cancelled'],
  picked_up: [],
  cancelled: [],
};

/** PATCH /api/staff/bookings/[id] — advance or cancel a booking. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff();

    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const { bookingStatus, cancelReason } = await parseBody(req, bookingStatusSchema);

    const current = await getBookingById(id);
    if (!current) throw notFound('Booking not found.');

    if (current.status === bookingStatus) {
      return ok({ booking: current, unchanged: true }, NO_STORE);
    }

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(bookingStatus)) {
      throw badRequest(
        `A booking that is "${current.status.replace('_', ' ')}" cannot move to ` +
          `"${bookingStatus.replace('_', ' ')}".`,
      );
    }

    const updated = await updateBookingStatus(id, bookingStatus, cancelReason);

    await writeAudit({
      tableName: 'bookings',
      recordId: id,
      action: 'UPDATE',
      summary: `Booking status ${current.status} → ${bookingStatus}${cancelReason ? ` (${cancelReason})` : ''}`,
      actor,
      oldValues: { booking_status: current.status },
      newValues: { booking_status: bookingStatus },
    });

    // Best-effort — a failed send must never fail the status change itself.
    const emailPromise =
      bookingStatus === 'cancelled'
        ? sendBookingCancelledEmail(updated, cancelReason)
        : sendStatusUpdateEmail(updated, bookingStatus);
    emailPromise.catch((e) => console.error('[staff.bookings.PATCH] status email failed:', e));

    return ok({ booking: updated }, NO_STORE);
  } catch (err) {
    return fail(err, 'staff.bookings.PATCH');
  }
}

/** GET /api/staff/bookings/[id] — full detail, including passport, for staff. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw badRequest('Invalid booking reference.');

    const booking = await getBookingById(id);
    if (!booking) throw notFound('Booking not found.');

    return ok({ booking }, NO_STORE);
  } catch (err) {
    return fail(err, 'staff.bookings.GET');
  }
}
