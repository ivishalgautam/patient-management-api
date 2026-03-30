import moment from "moment";
import table from "../db/models.js";

import {
  send24HoursBeforeAppointment,
  send2HoursBeforeAppointment,
  send1HourAfterAppointment,
  sendReviewMessage,
} from "../utils/whatsapp-template.js";

import { sequelize } from "../db/postgres.js";
import { QueryTypes } from "sequelize";

const formatSlot = (slot) => moment(slot, "HH:mm:ss").format("hh:mm A");

const updateNotificationFlag = async (bookingId, field) => {
  await table.BookingModel.updateOne(
    { [field]: true },
    { where: { id: bookingId } },
  );
};

const getPatientPhone = (booking) =>
  `${booking.country_code}${booking.mobile_number}`;

export const processAppointmentNotifications = async () => {
  try {
    const now = moment();

    const bookings = await sequelize.query(
      `
      SELECT 
          b.id,
          b.date,
          b.slot,
          b.status,
          b.notification_24hr_sent,
          b.notification_2hr_sent,
          b.notification_1hr_after_sent,
          b.review_message_sent,

          u.fullname,
          u.country_code,
          u.mobile_number

      FROM bookings b
      INNER JOIN patients p 
          ON p.id = b.patient_id
      INNER JOIN users u
          ON u.id = p.user_id

      WHERE b.status IN ('pending', 'completed')
      `,
      {
        type: QueryTypes.SELECT,
      },
    );

    console.log("📌 Total bookings:", bookings.length);

    if (!bookings?.length) {
      console.log("⚠️ No bookings found");
      return;
    }

    for (const booking of bookings) {
      try {
        const patientPhone = getPatientPhone(booking);
        const patientName = booking.fullname;

        const appointmentTime = moment(
          `${booking.date} ${booking.slot}`,
          "YYYY-MM-DD HH:mm:ss",
        );

        const minutesBefore = appointmentTime.diff(now, "minutes");
        const minutesAfter = now.diff(appointmentTime, "minutes");

        const formattedSlot = formatSlot(booking.slot);

        // ===============================
        // 24 HOURS BEFORE
        // ===============================
        if (
          booking.status === "pending" &&
          !booking.notification_24hr_sent &&
          minutesBefore <= 1440 &&
          minutesBefore > 1435
        ) {
          console.log(`📩 Sending 24hr reminder to ${patientName}`);

          await send24HoursBeforeAppointment({
            patient_phone: patientPhone,
            patient_name: patientName,
            booked_day: booking.date,
            booked_slot: formattedSlot,
          });

          await updateNotificationFlag(booking.id, "notification_24hr_sent");
        }

        // ===============================
        // 2 HOURS BEFORE
        // ===============================
        if (
          booking.status === "pending" &&
          !booking.notification_2hr_sent &&
          minutesBefore <= 120 &&
          minutesBefore > 115
        ) {
          console.log(`📩 Sending 2hr reminder to ${patientName}`);

          await send2HoursBeforeAppointment({
            patient_phone: patientPhone,
            patient_name: patientName,
            booked_slot: formattedSlot,
          });

          await updateNotificationFlag(booking.id, "notification_2hr_sent");
        }

        // ===============================
        // 1 HOUR AFTER
        // ===============================
        if (
          booking.status === "completed" &&
          !booking.notification_1hr_after_sent &&
          minutesAfter >= 60 &&
          minutesAfter < 65
        ) {
          console.log(`📩 Sending follow-up to ${patientName}`);

          await send1HourAfterAppointment({
            patient_phone: patientPhone,
            patient_name: patientName,
          });

          await updateNotificationFlag(
            booking.id,
            "notification_1hr_after_sent",
          );
        }

        // ===============================
        // REVIEW MESSAGE
        // ===============================
        if (
          booking.status === "completed" &&
          !booking.review_message_sent &&
          minutesAfter >= 120 &&
          minutesAfter < 125
        ) {
          console.log(`⭐ Sending review request to ${patientName}`);

          await sendReviewMessage({
            patient_phone: patientPhone,
            patient_name: patientName,
          });

          await updateNotificationFlag(booking.id, "review_message_sent");
        }
      } catch (bookingError) {
        console.error(
          `❌ Error processing booking ${booking.id}:`,
          bookingError,
        );
      }
    }
  } catch (error) {
    console.error("❌ Notification service failed:", error);
  }
};
