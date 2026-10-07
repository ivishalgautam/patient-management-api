import fp from "fastify-plugin";
import { ToadScheduler } from "toad-scheduler";
import { scheduleAppointmentCron } from "../scheduler/appointment-cron.js";

export default fp(async (app, { enableCron = false } = {}) => {
  const scheduler = new ToadScheduler();
  app.decorate("scheduler", scheduler);
  if (enableCron) scheduleAppointmentCron(scheduler);
  app.addHook("onClose", async () => scheduler.stop());
});
