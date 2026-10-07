import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb } from "../setup/db.js";
import { createAdmin, createService, login, api } from "../setup/factories.js";

let app;
let service;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  const admin = await createAdmin();
  service = await createService(app, await login(app, admin), "Teeth Whitening");
});
afterAll(() => app.close());

// Used by the public website / patient app without a token.
describe("public catalogue", () => {
  it("lists banners, procedures and services without auth", async () => {
    for (const url of ["/v1/banners", "/v1/procedures", "/v1/services"]) {
      const res = await api(app).get(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.json().status, url).toBe(true);
    }
  });

  it("lists services of a procedure without auth", async () => {
    const res = await api(app).get(
      `/v1/services/getByProcedureId/${service.procedure_id}`,
    );
    expect(res.statusCode).toBe(200);
  });

  it("keeps service writes behind auth", async () => {
    const res = await api(app).post("/v1/services", { name: "x" });
    expect(res.statusCode).toBe(401);
  });
});
