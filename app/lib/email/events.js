"use strict";
// Lead events for email automation, queued only after the lead's
// transaction commits so the job never sees a rolled-back lead.
import crypto from "crypto";
import { QUEUES, enqueue, isQueueStarted } from "../../jobs/queue.js";

export function emitLeadEvent(transaction, event) {
  const send = () => {
    if (!isQueueStarted()) return;
    enqueue(QUEUES.EMAIL_AUTOMATION, { ...event, eventId: crypto.randomUUID() }).catch((error) =>
      console.error("[email] couldn't queue automation event", error.message),
    );
  };
  if (transaction?.afterCommit) transaction.afterCommit(send);
  else send();
}
