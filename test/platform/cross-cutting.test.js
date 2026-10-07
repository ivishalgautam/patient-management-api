import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { z } from "zod";
import { buildApp } from "../../app.js";
import { AppError, notFound } from "../../app/lib/app-error.js";

let app;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  // Test-only routes that raise each kind of error.
  app.get("/__test/zod", async () => z.object({ a: z.string() }).parse({}));
  app.get("/__test/app-error", async () => {
    throw notFound("Patient not found.");
  });
  app.get("/__test/conflict", async () => {
    throw new AppError(409, "Duplicate.", { code: "DUPLICATE" });
  });
  app.get("/__test/crash", async () => {
    throw new Error('relation "secret_table" does not exist');
  });
  app.get("/__test/ok", async (req, reply) => reply.ok({ id: 1 }, { message: "Done." }));
  await app.ready();
});
afterAll(() => app.close());

describe("platform", () => {
  it("GET /health reports the database", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: true, data: { db: "ok" } });
  });

  it("returns x-request-id and honours an incoming one", async () => {
    const res = await app.inject({ url: "/health", headers: { "x-request-id": "abc-123" } });
    expect(res.headers["x-request-id"]).toBe("abc-123");
    const gen = await app.inject({ url: "/health" });
    expect(gen.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reply.ok wraps data in the standard envelope", async () => {
    const res = await app.inject({ url: "/__test/ok" });
    expect(res.json()).toEqual({ status: true, data: { id: 1 }, message: "Done." });
  });

  it("maps Zod errors to 400 with field messages", async () => {
    const res = await app.inject({ url: "/__test/zod" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: false, error: "Bad Request" });
    expect(res.json().message).toContain("a - ");
  });

  it("maps AppError to its status", async () => {
    const res = await app.inject({ url: "/__test/app-error" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ status: false, error: "Not Found", message: "Patient not found." });
    const c = await app.inject({ url: "/__test/conflict" });
    expect(c.statusCode).toBe(409);
    expect(c.json().code).toBe("DUPLICATE");
  });

  it("never leaks internal error text on 500", async () => {
    const res = await app.inject({ url: "/__test/crash" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret_table");
    expect(res.json().request_id).toBe(res.headers["x-request-id"]);
  });

  it("does not serve source files from the server root", async () => {
    for (const url of ["/package.json", "/app.js", "/.env", "/backup.sql"]) {
      expect((await app.inject({ url })).statusCode, url).toBe(404);
    }
  });
});
