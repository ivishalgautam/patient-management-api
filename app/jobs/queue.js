"use strict";
import PgBoss from "pg-boss";
import config from "../config/index.js";

// Background jobs on pg-boss (Postgres-backed: retries, backoff, scheduling,
// failed-job history). One instance per process.
let boss = null;

export const QUEUES = {
  WHATSAPP_SEND: "whatsapp.send",
  REMINDERS_RECONCILE: "reminders.reconcile",
  REMINDER_SEND: "reminders.send",
  INTEGRATION_PROCESS: "integrations.process",
  FB_PULL_SYNC: "integrations.fb-pull-sync",
  FB_TOKEN_CHECK: "integrations.fb-token-check",
  PAYLOAD_PURGE: "integrations.purge-payloads",
  LEADS_IMPORT: "leads.import",
};

// Retry policy per queue.
const QUEUE_OPTIONS = {
  [QUEUES.WHATSAPP_SEND]: { retryLimit: 4, retryDelay: 30, retryBackoff: true },
  [QUEUES.REMINDERS_RECONCILE]: { retryLimit: 0 },
  [QUEUES.REMINDER_SEND]: { retryLimit: 4, retryDelay: 60, retryBackoff: true },
  [QUEUES.INTEGRATION_PROCESS]: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
  [QUEUES.FB_PULL_SYNC]: { retryLimit: 0 },
  [QUEUES.FB_TOKEN_CHECK]: { retryLimit: 1 },
  [QUEUES.PAYLOAD_PURGE]: { retryLimit: 1 },
  [QUEUES.LEADS_IMPORT]: { retryLimit: 3, retryDelay: 60, retryBackoff: true },
};

export function getBoss() {
  if (!boss) throw new Error("Job queue is not started.");
  return boss;
}

export const isQueueStarted = () => !!boss;

export async function startQueue({ queues = {}, extraQueues = {} } = {}) {
  if (boss) return boss;
  boss = new PgBoss({
    host: config.pg_host,
    port: config.pg_port,
    database: config.pg_database_name,
    user: config.pg_username,
    password: config.pg_password,
    schema: "pgboss",
    migrate: false,
    max: 4,
  });
  boss.on("error", (error) => console.error("[queue]", error.message));
  await boss.start();
  for (const [name, options] of Object.entries({ ...QUEUE_OPTIONS, ...extraQueues })) {
    await boss.createQueue(name, options);
  }
  return boss;
}

export async function stopQueue() {
  if (!boss) return;
  const b = boss;
  boss = null;
  await b.stop({ graceful: true, timeout: 5000 });
}

// Enqueue a job. Options: singletonKey (dedupe), startAfter (Date|seconds).
export async function enqueue(name, data, options = {}) {
  return getBoss().send(name, data, options);
}

export default { startQueue, stopQueue, enqueue, getBoss, QUEUES, isQueueStarted };
