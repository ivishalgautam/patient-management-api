import { beforeAll, describe, it, expect } from "vitest";
import { QueryTypes } from "sequelize";
import fs from "fs";
import { sequelize } from "../../app/db/postgres.js";
import { resetDb } from "../setup/db.js";
import { checkConfig, checkDatabase, hasFailures } from "../../app/lib/preflight.js";

const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const migrations = fs.readdirSync(new URL("../../migrations/", import.meta.url)).filter((f) => f.endsWith(".js")).sort();
const levels = (results, check) => results.filter((r) => r.check === check).map((r) => r.level);

const prodConfig = {
  isProduction: true,
  jwt_secret: "a".repeat(48),
  jwt_refresh_secret: "b".repeat(48),
  integrations: { encryption_key: "k" },
  api_url: "https://api.example.in/v1",
  app_url: "https://app.example.in",
  allowed_origins: ["https://app.example.in"],
  permissions_enforce: true,
};

describe("preflight: settings", () => {
  it("passes a complete production config", () => {
    const results = checkConfig(prodConfig, { LEGACY_TOKEN_GRACE_UNTIL: "2026-11-01T00:00:00Z" });
    expect(results).toEqual([{ level: "OK", check: "settings", message: "required settings present" }]);
  });

  it("fails weak or reused JWT secrets and warns about localhost URLs and missing keys", () => {
    const results = checkConfig(
      { ...prodConfig, jwt_secret: "short", jwt_refresh_secret: "short", integrations: {}, api_url: "http://localhost:3001/v1", allowed_origins: [] },
      {},
    );
    expect(hasFailures(results)).toBe(true);
    expect(levels(results, "JWT_SECRET")).toEqual(["FAIL"]);
    expect(levels(results, "JWT secrets")).toEqual(["FAIL"]);
    expect(levels(results, "API_URL")).toEqual(["WARN"]);
    expect(levels(results, "INTEGRATION_ENCRYPTION_KEY")).toEqual(["WARN"]);
    expect(levels(results, "ALLOWED_ORIGINS")).toEqual(["WARN"]);
    expect(levels(results, "LEGACY_TOKEN_GRACE_UNTIL")).toEqual(["WARN"]);
  });
});

describe("preflight: database", () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("a migrated database is ready", async () => {
    const results = await checkDatabase(q, { migrations, env: {} });
    expect(hasFailures(results)).toBe(false);
    expect(results.find((r) => r.check === "migrations").message).toBe("up to date");
  });

  it("reports pending migrations", async () => {
    const results = await checkDatabase(q, { migrations: [...migrations, "29990101000000-future.js"], env: {} });
    expect(results.find((r) => r.check === "migrations").message).toBe("1 pending: 29990101000000-future.js");
  });
});
