// In-app notifications for appointment bookings and their updates:
// user_notifications.booking_id points at the booking so the apps can open it.
export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    ALTER TABLE public.user_notifications
      ADD COLUMN booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE;
    CREATE INDEX user_notifications_booking ON public.user_notifications (booking_id) WHERE booking_id IS NOT NULL;
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS public.user_notifications_booking;
    ALTER TABLE public.user_notifications DROP COLUMN IF EXISTS booking_id;
  `);
}
