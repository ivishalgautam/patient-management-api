import fp from "fastify-plugin";
import { ToadScheduler, SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import config from "../config/index.js";
import {
  findDueReminders,
  sendReminder,
} from "../services/notifications/appointment-reminders.js";

// In-process timer, used only when REMINDERS_ENGINE=legacy (rollback switch);
// normally reminders run as pg-boss jobs (plugins/queue.js).
export default fp(async (app, { enableCron = false } = {}) => {
  const scheduler = new ToadScheduler();
  app.decorate("scheduler", scheduler);
  app.addHook("onClose", async () => scheduler.stop());
  if (!enableCron || config.reminders_engine !== "legacy") return;

  const task = new AsyncTask(
    "appointment-reminders",
    async () => {
      for (const due of await findDueReminders()) await sendReminder(due);
    },
    (error) => app.log.error({ err: error }, "appointment reminders failed"),
  );
  scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ minutes: 5 }, task));
});
