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

  it("needs clinic_id to self-register when several practices exist", async () => {
    await createDoctor();
    await createDoctor();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { fullname: "No Clinic", country_code: "91", mobile_number: "9876500000", role: "patient" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("lets a patient self-register (hotfix: TDZ bug fixed)", async () => {
    const doc = await createDoctor();
    const clinic = await api(app, await login(app, doc)).post("/v1/clinics", {
      name: "Reg Clinic",
      address: "x",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        fullname: "Self Patient",
        country_code: "91",
        mobile_number: "9876543210",
        role: "patient",
        clinic_id: clinic.json().data.id,
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

  it("accepts a pre-revamp token during the grace period", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const doc = await createDoctor();
    const legacy = jwt.sign({ user: { username: doc.username } }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    expect((await api(app, legacy).get("/v1/users/me")).statusCode).toBe(200);
  });

  it("refresh rotates tokens and the new pair works", async () => {
    const doc = await createDoctor();
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: doc.username, password: doc.password },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refresh_token: loginRes.json().refresh_token },
    });
    expect(res.statusCode).toBe(200);
    const { token, refresh_token, expire_time } = res.json();
    expect(refresh_token).toBeTypeOf("string");
    expect(expire_time).toBeGreaterThan(Date.now());
    expect((await api(app, token).get("/v1/users/me")).statusCode).toBe(200);
  });

  it("a refresh token cannot be used as an access token", async () => {
    const doc = await createDoctor();
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: doc.username, password: doc.password },
    });
    const res = await api(app, loginRes.json().refresh_token).get("/v1/users/me");
    expect(res.statusCode).toBe(401);
  });

  it("refresh is refused for a deactivated user", async () => {
    const doc = await createDoctor();
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: doc.username, password: doc.password },
    });
    const { query } = await import("../setup/db.js");
    await query(`UPDATE users SET is_active = false WHERE id = :id`, { id: doc.user.id });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refresh_token: loginRes.json().refresh_token },
    });
    expect(res.statusCode).toBe(401);
  });

  it("access tokens carry only identifiers", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const doc = await createDoctor();
    const token = await login(app, doc);
    const payload = jwt.decode(token);
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "role", "sub", "typ", "ver"]);
  });

  it("accepts the access token from the dashboard's httpOnly cookie", async () => {
    const doc = await createDoctor();
    const token = await login(app, doc);
    const res = await app.inject({ url: "/v1/users/me", cookies: { token } });
    expect(res.statusCode).toBe(200);
  });
});
