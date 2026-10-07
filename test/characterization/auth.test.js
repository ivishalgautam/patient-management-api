import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb } from "../setup/db.js";
import { createAdmin, createDoctor, login, api } from "../setup/factories.js";

let app;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
});
afterAll(() => app.close());

describe("auth", () => {
  it("logs in a doctor and returns tokens + user", async () => {
    const doc = await createDoctor();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: doc.username, password: doc.password, role: "doctor" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe(true);
    expect(body.token).toBeTypeOf("string");
    expect(body.refresh_token).toBeTypeOf("string");
    expect(body.user_data.username).toBe(doc.username);
  });

  it("rejects a wrong password with 400", async () => {
    const doc = await createDoctor();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: doc.username, password: "nope", role: "doctor" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().status).toBe(false);
  });

  it("returns 404 when the role does not match the user", async () => {
    const doc = await createDoctor();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: doc.username, password: doc.password, role: "admin" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("refreshes an access token", async () => {
    const admin = await createAdmin();
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: admin.username, password: admin.password, role: "admin" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refresh_token: loginRes.json().refresh_token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTypeOf("string");
  });

  it("GET /users/me returns the current user", async () => {
    const doc = await createDoctor();
    const token = await login(app, doc);
    const res = await api(app, token).get("/v1/users/me");
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe(doc.username);
  });

  it("requires a token on protected routes", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/users" });
    expect(res.statusCode).toBe(401);
  });

  it("lets a patient self-register (hotfix: TDZ bug fixed)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        fullname: "Self Patient",
        country_code: "91",
        mobile_number: "9876543210",
        role: "patient",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user_data.role).toBe("patient");
    expect(res.json().user_data.username).toMatch(/^ddss\d+$/);
  });

  it("refuses self-registration as admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        fullname: "x",
        country_code: "91",
        mobile_number: "1",
        username: "evil1",
        password: "secret",
        role: "admin",
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
