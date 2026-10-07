"use strict";
import "dotenv/config";
import { z } from "zod";

// Every environment variable the API reads is declared here and validated
// once at startup. Nothing else in app/ should read process.env directly.

const optional = z.string().optional().default("");
const csv = z
  .string()
  .optional()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .optional()
    .default("development"),
  PORT: z.coerce.number().int().positive().optional().default(3001),
  // Interface to bind; keep localhost behind a reverse proxy.
  HOST: z.string().optional().default("localhost"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),

  DB_DIALECT: z.literal("postgres").optional().default("postgres"),
  PG_HOST: z.string().optional().default("localhost"),
  PG_PORT: z.coerce.number().int().positive().optional().default(5432),
  PG_DATABASE: z.string().min(1, "PG_DATABASE is required"),
  PG_USERNAME: z.string().min(1, "PG_USERNAME is required"),
  PG_PASSWORD: optional,

  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  // jsonwebtoken duration strings ("15m", "1d"). Default access TTL stays
  // long until every client (incl. the patient app) refreshes tokens.
  ACCESS_TOKEN_TTL: z.string().optional().default("1d"),
  REFRESH_TOKEN_TTL: z.string().optional().default("30d"),
  // Tokens issued before the revamp (full user object in the payload) are
  // accepted until this ISO date. Empty = not accepted.
  LEGACY_TOKEN_GRACE_UNTIL: z.string().optional().default(""),
  PATIENT_PASSWORD_MODE: z.enum(["random", "legacy"]).optional().default("random"),

  // Empty = allow any origin (pre-revamp behaviour); a warning is logged.
  ALLOWED_ORIGINS: csv,
  MAX_RATE_LIMIT: z.coerce.number().int().positive().optional().default(300),
  TIME_WINDOW: z.string().optional().default("1 minute"),
  MAX_UPLOAD_MB: z.coerce.number().positive().optional().default(100),

  // Legacy single-clinic Excel import defaults.
  CLINIC_ID: optional,
  DOCTOR_ID: optional,
  DOCTOR_USER_ID: optional,
  PROCEDURE_ID: optional,

  SMTP_EMAIL: optional,
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SERVER: optional,
  SMTP_PASSWORD: optional,

  WAFFLY_LICENSE: optional,
  WAFFLY_API_KEY: optional,
  WAFFLY_TEMPLATE_BOOKING_CONFIRM: optional,
  WAFFLY_TEMPLATE_24_HOURS_BEFORE_APPOINTMENT: optional,
  WAFFLY_TEMPLATE_2_HRS_BEFORE_APPOINTMENT: optional,
  WAFFLY_TEMPLATE_1_HR_AFTER_APPOINTMENT: optional,
  WAFFLY_TEMPLATE_REVIEW_MESAAGE: optional,
});

function loadEnv() {
  // An empty value in .env ("LOG_LEVEL=") means "not set".
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== ""),
  );
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

const env = loadEnv();
process.env.NODE_ENV = env.NODE_ENV;

const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  host: env.HOST,
  log_level:
    env.LOG_LEVEL ??
    (env.NODE_ENV === "production" ? "info" : env.NODE_ENV === "test" ? "silent" : "debug"),

  // postgres
  pg_database_name: env.PG_DATABASE,
  pg_username: env.PG_USERNAME,
  pg_password: env.PG_PASSWORD,
  pg_host: env.PG_HOST,
  pg_dialect: env.DB_DIALECT,
  pg_port: env.PG_PORT,

  // auth
  jwt_secret: env.JWT_SECRET,
  jwt_refresh_secret: env.JWT_REFRESH_SECRET,
  access_token_ttl: env.ACCESS_TOKEN_TTL,
  refresh_token_ttl: env.REFRESH_TOKEN_TTL,
  legacy_token_grace_until: env.LEGACY_TOKEN_GRACE_UNTIL
    ? new Date(env.LEGACY_TOKEN_GRACE_UNTIL)
    : null,
  patient_password_mode: env.PATIENT_PASSWORD_MODE,

  // http
  allowed_origins: env.ALLOWED_ORIGINS,
  rate_limit: { max: env.MAX_RATE_LIMIT, time_window: env.TIME_WINDOW },
  max_upload_bytes: Math.round(env.MAX_UPLOAD_MB * 1024 * 1024),

  // smtp
  smtp_from_email: env.SMTP_EMAIL,
  smtp_port: env.SMTP_PORT,
  smtp_host: env.SMTP_SERVER,
  smtp_password: env.SMTP_PASSWORD,

  // legacy single-clinic import
  clinic_id: env.CLINIC_ID,
  doctor_id: env.DOCTOR_ID,
  doctor_user_id: env.DOCTOR_USER_ID,
  procedure_id: env.PROCEDURE_ID,

  // waffly
  waffly_license: env.WAFFLY_LICENSE,
  waffly_api_key: env.WAFFLY_API_KEY,
  waffly_template_booking_confirm: env.WAFFLY_TEMPLATE_BOOKING_CONFIRM,
  waffly_template_24_hours_before_appointment:
    env.WAFFLY_TEMPLATE_24_HOURS_BEFORE_APPOINTMENT,
  waffly_template_2_hrs_before_appointment:
    env.WAFFLY_TEMPLATE_2_HRS_BEFORE_APPOINTMENT,
  waffly_template_1_hr_after_appointment:
    env.WAFFLY_TEMPLATE_1_HR_AFTER_APPOINTMENT,
  waffly_template_review_mesaage: env.WAFFLY_TEMPLATE_REVIEW_MESAAGE,
});

export default config;
