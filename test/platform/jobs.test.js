import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { waflyRequest } from "../setup/env.js";
import { enqueue, getBoss, QUEUES } from "../../app/jobs/queue.js";

let app;
let A;
let B;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  A = await setupPractice(app);
  B = await setupPractice(app);
});
afterAll(() => app.close());

async function failedJob(practiceId) {
  waflyRequest.mockRejectedValueOnce(new Error("wafly down"));
  const id = await enqueue(
    QUEUES.WHATSAPP_SEND,
    { kind: "booking_confirm", practiceId, payload: { patient_phone: "91999", patient_name: "x" } },
    { retryLimit: 0 },
  );
  await vi.waitFor(async () => {
    const job = await getBoss().getJobById(QUEUES.WHATSAPP_SEND, id);
    expect(job.state).toBe("failed");
  }, { timeout: 15000, interval: 300 });
  return id;
}

describe("failed jobs", () => {
  it("lists a practice's failed jobs and retries one", async () => {
    const id = await failedJob(A.clinic.practice_id ?? (await practiceOf(A)));
    const list = await api(app, A.doctor.token).get("/v1/jobs/failed");
    expect(list.statusCode).toBe(200);
    expect(list.json().data.map((j) => j.id)).toContain(id);
    expect(list.json().meta.total).toBeGreaterThan(0);

    const retry = await api(app, A.doctor.token).post(`/v1/jobs/${id}/retry`);
    expect(retry.statusCode).toBe(200);
    await vi.waitFor(async () => {
      const job = await getBoss().getJobById(QUEUES.WHATSAPP_SEND, id);
      expect(job.state).toBe("completed");
    }, { timeout: 15000, interval: 300 });
  });

  it("does not show or retry another practice's jobs", async () => {
    const id = await failedJob(await practiceOf(A));
    const list = await api(app, B.doctor.token).get("/v1/jobs/failed");
    expect(list.json().data.map((j) => j.id)).not.toContain(id);
    expect((await api(app, B.doctor.token).post(`/v1/jobs/${id}/retry`)).statusCode).toBe(404);
  });

  it("staff can't see failed jobs", async () => {
    expect((await api(app, A.staff.token).get("/v1/jobs/failed")).statusCode).toBe(403);
  });
});

async function practiceOf(p) {
  const { query } = await import("../setup/db.js");
  return (await query(`SELECT practice_id FROM clinics WHERE id = :c`, { c: p.clinic.id }))[0].practice_id;
}
