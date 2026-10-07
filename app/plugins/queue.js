import fp from "fastify-plugin";
import config from "../config/index.js";
import { startQueue, stopQueue, QUEUES } from "../jobs/queue.js";
import { HANDLERS } from "../jobs/handlers.js";

// Starts pg-boss for enqueueing. Workers (and the reminder schedule) run
// only where enableWorkers is set (the main server process, and tests).
export default fp(async (app, { enableWorkers = false } = {}) => {
  await startQueue();
  app.addHook("onClose", async () => stopQueue());
  if (!enableWorkers) return;

  const boss = (await import("../jobs/queue.js")).getBoss();
  for (const [name, handler] of Object.entries(HANDLERS)) {
    await boss.work(name, { pollingIntervalSeconds: config.isTest ? 0.5 : 2 }, handler);
  }
  if (config.reminders_engine === "queue") {
    await boss.schedule(QUEUES.REMINDERS_RECONCILE, "*/5 * * * *");
  } else {
    await boss.unschedule(QUEUES.REMINDERS_RECONCILE).catch(() => {});
  }
});
