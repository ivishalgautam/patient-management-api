"use strict";
// Read-only deploy checks: run against the target database (production or
// a restored copy) before migrating. Nothing here writes.
//   FAIL  the deploy will break (a migration aborts, a required setting is missing)
//   WARN  works, but probably not what you want in production
//   OK / INFO  for the record
import { BASELINE } from "../db/migrator.js";

const result = (level, check, message) => ({ level, check, message });

// --- settings ---------------------------------------------------------------
export function checkConfig(config, env = process.env) {
  const out = [];
  const prod = config.isProduction ?? env.NODE_ENV === "production";
  const isLocal = (url) => !url || /localhost|127\.0\.0\.1/.test(url);

  for (const [name, value] of [["JWT_SECRET", config.jwt_secret], ["JWT_REFRESH_SECRET", config.jwt_refresh_secret]]) {
    if (!value) out.push(result("FAIL", name, "not set"));
    else if (prod && String(value).length < 32) out.push(result("FAIL", name, "shorter than 32 characters"));
  }
  if (config.jwt_secret && config.jwt_secret === config.jwt_refresh_secret) {
    out.push(result("FAIL", "JWT secrets", "JWT_SECRET and JWT_REFRESH_SECRET are the same"));
  }
  if (!config.integrations?.encryption_key) {
    out.push(result("WARN", "INTEGRATION_ENCRYPTION_KEY", "not set: Facebook/Google/webhook integrations will be unavailable"));
  }
  if (prod) {
    if (isLocal(config.api_url)) out.push(result("WARN", "API_URL", `"${config.api_url}" — webhook URLs shown to admins would point at localhost`));
    if (isLocal(config.app_url)) out.push(result("WARN", "APP_URL", `"${config.app_url}" — form links and OAuth redirects would point at localhost`));
    if (!config.allowed_origins?.length) out.push(result("WARN", "ALLOWED_ORIGINS", "empty: CORS allows every origin"));
    if (!env.LEGACY_TOKEN_GRACE_UNTIL) {
      out.push(result("WARN", "LEGACY_TOKEN_GRACE_UNTIL", "not set: everyone signed in with a pre-revamp token is logged out on deploy"));
    }
  }
  if (config.permissions_enforce === false) out.push(result("WARN", "PERMISSIONS_ENFORCE", "false: permission denials are only logged"));
  if (!out.some((r) => r.level !== "OK")) out.push(result("OK", "settings", "required settings present"));
  return out;
}

// --- database ---------------------------------------------------------------
const tableExists = async (q, name) =>
  !!(await q(`SELECT to_regclass(:name) AS t`, { name: `public."${name}"` }))[0].t;

export async function checkDatabase(q, { env = process.env, migrations = [] } = {}) {
  const out = [];

  const [{ version }] = await q(`SELECT current_setting('server_version_num')::int AS version`);
  out.push(version >= 130000 ? result("OK", "PostgreSQL", `version ${Math.floor(version / 10000)}`) : result("FAIL", "PostgreSQL", "version 13 or newer is required"));
  const [trgm] = await q(`SELECT 1 AS ok FROM pg_available_extensions WHERE name = 'pg_trgm'`);
  if (!trgm) out.push(result("FAIL", "pg_trgm", "extension not available (needed for lead search)"));

  const hasUsers = await tableExists(q, "users");
  const hasMeta = await tableExists(q, "SequelizeMeta");
  const executed = hasMeta ? (await q(`SELECT name FROM "SequelizeMeta"`)).map((r) => r.name) : [];
  const pending = migrations.filter((m) => !executed.includes(m));

  if (!hasUsers) {
    out.push(result("INFO", "migrations", "empty database: run `npm run migrate:up`"));
    return out;
  }
  if (!executed.includes(BASELINE)) {
    out.push(result("INFO", "migrations", "existing database without migration history: back it up, run `npm run migrate:baseline` once, then `npm run migrate:up`"));
  } else {
    out.push(result("INFO", "migrations", pending.length ? `${pending.length} pending: ${pending.join(", ")}` : "up to date"));
  }

  // Conditions that make the tenancy / hardening migrations abort.
  if (!(await tableExists(q, "practices"))) {
    const [{ n: doctors }] = await q(`SELECT count(*)::int AS n FROM doctors`);
    const shared = await q(`
      SELECT patient_id FROM (
        SELECT m.patient_id, m.doctor_id FROM doctor_patient_mappings m
        UNION SELECT m.patient_id, c.doctor_id FROM clinic_patient_mappings m JOIN clinics c ON c.id = m.clinic_id
        UNION SELECT b.patient_id, c.doctor_id FROM bookings b JOIN clinics c ON c.id = b.clinic_id
        UNION SELECT t.patient_id, c.doctor_id FROM treatments t JOIN clinics c ON c.id = t.clinic_id
        UNION SELECT l.patient_id, c.doctor_id FROM ledgers l JOIN clinics c ON c.id = l.clinic_id
      ) links GROUP BY patient_id HAVING count(DISTINCT doctor_id) > 1 LIMIT 20`);
    if (shared.length) {
      out.push(result("FAIL", "tenancy", `${shared.length}${shared.length === 20 ? "+" : ""} patient(s) are linked to more than one doctor; decide which practice owns them (e.g. ${shared.slice(0, 3).map((r) => r.patient_id).join(", ")})`));
    }
    const [{ n: unlinked }] = await q(`
      SELECT count(*)::int AS n FROM patients p
       WHERE NOT EXISTS (SELECT 1 FROM doctor_patient_mappings m WHERE m.patient_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM clinic_patient_mappings m WHERE m.patient_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.patient_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM treatments t WHERE t.patient_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.patient_id = p.id)`);
    if (unlinked && doctors > 1 && !env.UNLINKED_PATIENT_PRACTICE_ID) {
      out.push(result("FAIL", "tenancy", `${unlinked} patient(s) have no clinic or doctor link and there are ${doctors} doctors: set UNLINKED_PATIENT_PRACTICE_ID`));
    } else if (unlinked) {
      out.push(result("INFO", "tenancy", `${unlinked} unlinked patient(s) will be assigned to ${doctors > 1 ? "UNLINKED_PATIENT_PRACTICE_ID" : "the only practice"}`));
    }
  }
  for (const [table, col] of [["doctors", "user_id"], ["patients", "user_id"], ["staffs", "user_id"]]) {
    const dups = await q(`SELECT ${col} AS v FROM ${table} GROUP BY ${col} HAVING count(*) > 1 LIMIT 5`);
    if (dups.length) out.push(result("FAIL", "hardening", `${table}.${col} has duplicates (${dups.map((d) => d.v).join(", ")})`));
  }

  // Data the new appointment rules will refuse to touch (informational).
  const today = `(now() AT TIME ZONE :tz)::date`;
  const tz = env.CLINIC_TIMEZONE || "Asia/Kolkata";
  const [{ n: outside }] = await q(
    `SELECT count(*)::int AS n FROM bookings b JOIN slots s ON s.clinic_id = b.clinic_id
      WHERE b.status = 'pending' AND b.date >= ${today}
        AND (NOT (b.slot::text = ANY (s.slots::text[])) OR extract(dow FROM b.date)::int = ANY (s.days_off))`,
    { tz },
  );
  if (outside) out.push(result("WARN", "appointments", `${outside} upcoming appointment(s) fall outside their clinic's schedule; schedule edits stay blocked until they're moved or canceled`));
  const [{ n: stale }] = await q(`SELECT count(*)::int AS n FROM bookings WHERE status = 'pending' AND date < ${today}`, { tz });
  if (stale) out.push(result("INFO", "appointments", `${stale} past appointment(s) are still pending (can be completed or canceled)`));

  return out;
}

export const hasFailures = (results) => results.some((r) => r.level === "FAIL");
