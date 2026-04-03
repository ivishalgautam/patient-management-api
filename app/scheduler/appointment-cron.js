import { CronJob, AsyncTask } from "toad-scheduler";
import { processAppointmentNotifications } from "../services/appointment-notification.service.js";

const APPOINTMENT_CRON = "*/10 * * * * *";
// const APPOINTMENT_CRON = "*/5 * * * * *";
// every 5 minutes

export const scheduleAppointmentCron = (scheduler) => {
  const jobId = "appointment-notification-job";

  if (scheduler.existsById?.(jobId)) {
    console.log("⚠️ Appointment cron already scheduled");
    return;
  }

  const task = new AsyncTask(
    "appointment-notification-task",
    async () => {
      console.log("🚀 Running appointment notification cron");
      await processAppointmentNotifications();
    },
    (error) => {
      console.error("❌ Appointment cron failed:", error);
    },
  );

  const job = new CronJob({ cronExpression: APPOINTMENT_CRON }, task, {
    id: jobId,
  });

  scheduler.addCronJob(job);

  console.log("✅ Appointment notification cron scheduled");
};
