"use strict";
import { QUEUES, enqueue } from "./queue.js";
import { sendWhatsApp } from "../services/whatsapp/templates.js";
import {
  findDueReminders,
  sendReminder,
} from "../services/notifications/appointment-reminders.js";

// pg-boss v10 hands workers an array of jobs.
const each = (fn) => async (jobs) => {
  for (const job of [].concat(jobs)) await fn(job.data, job);
};

export const HANDLERS = {
  [QUEUES.WHATSAPP_SEND]: each(({ kind, payload }) => sendWhatsApp(kind, payload)),

  [QUEUES.REMINDERS_RECONCILE]: each(async () => {
    for (const due of await findDueReminders()) {
      await enqueue(QUEUES.REMINDER_SEND, due, {
        singletonKey: `${due.kind}:${due.bookingId}`,
      });
    }
  }),

  [QUEUES.REMINDER_SEND]: each((data) => sendReminder(data)),
};

export default HANDLERS;
