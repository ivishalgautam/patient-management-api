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
  PG_POOL_MAX: z.coerce.number().int().positive().optional().default(20),

  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  // jsonwebtoken duration strings ("15m", "1d"). Default access TTL stays
  // long until every client (incl. the patient app) refreshes tokens.
  ACCESS_TOKEN_TTL: z.string().optional().default("1d"),
  REFRESH_TOKEN_TTL: z.string().optional().default("30d"),
  // Tokens issued before the revamp (full user object in the payload) are
  // accepted until this ISO date. Empty = not accepted.
  LEGACY_TOKEN_GRACE_UNTIL: z.string().optional().default(""),
  // false = log permission denials instead of blocking (rollback switch).
  PERMISSIONS_ENFORCE: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),
  // queue = pg-boss jobs with retries (default); legacy = in-process timer.
  REMINDERS_ENGINE: z.enum(["queue", "legacy"]).optional().default("queue"),
  // Region for parsing phone numbers without a country code (lead dedupe).
  CLINIC_TIMEZONE: z.string().optional().default("Asia/Kolkata"),
  DEFAULT_PHONE_REGION: z.string().length(2).optional().default("IN"),
  // Public dashboard URL (share links / embed snippets for lead forms).
  APP_URL: z.string().url().optional(),
  // Public API base with /v1 (webhook URLs shown to admins).
  API_URL: z.string().url().optional(),
  // Signs public form render tokens; defaults to a key derived from JWT_SECRET.
  FORM_TOKEN_SECRET: optional,
  // Cloudflare Turnstile for public forms (off unless both are set).
  TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET_KEY: optional,
  // Lead integrations. 32-byte base64 key for stored tokens
  // (openssl rand -base64 32); required once an integration is connected.
  INTEGRATION_ENCRYPTION_KEY: optional,
  INTEGRATION_PAYLOAD_RETENTION_DAYS: z.coerce.number().int().min(1).optional().default(30),
  LEAD_EXPORT_MAX_ROWS: z.coerce.number().int().min(1).optional().default(10000),
  LEAD_FOLLOW_UP_REMIND_MINUTES: z.coerce.number().int().min(0).optional().default(15),
  LEAD_FOLLOW_UP_REMINDER_CRON: z.string().optional().default("*/5 * * * *"),
  LEAD_IMPORT_MAX_ROWS: z.coerce.number().int().min(1).optional().default(5000),
  LEAD_IMPORT_SHEET_MAX_MB: z.coerce.number().min(1).optional().default(10),
  FACEBOOK_APP_ID: optional,
  FACEBOOK_APP_SECRET: optional,
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: optional,
  WHATSAPP_APP_SECRET: optional,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optional,
  WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).optional().default("v23.0"),
  WHATSAPP_CAMPAIGN_SEND_INTERVAL_MS: z.coerce.number().int().min(0).optional().default(300),
  FACEBOOK_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).optional().default("v23.0"),
  FB_PULL_SYNC_CRON: z.string().optional().default("*/10 * * * *"),
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
  PATIENT_MESSAGES_CRON: z.string().optional().default("0 10 * * *"),
  EMAIL_INBOUND_SYNC_CRON: z.string().optional().default("*/5 * * * *"),
  EMAIL_CAMPAIGN_SEND_INTERVAL_MS: z.coerce.number().int().min(0).optional().default(1500),
  PATIENT_MESSAGE_SEND_INTERVAL_MS: z.coerce.number().int().min(0).optional().default(1000),

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
  pg_pool_max: env.PG_POOL_MAX,

  // auth
  jwt_secret: env.JWT_SECRET,
  jwt_refresh_secret: env.JWT_REFRESH_SECRET,
  access_token_ttl: env.ACCESS_TOKEN_TTL,
  refresh_token_ttl: env.REFRESH_TOKEN_TTL,
  legacy_token_grace_until: env.LEGACY_TOKEN_GRACE_UNTIL
    ? new Date(env.LEGACY_TOKEN_GRACE_UNTIL)
    : null,
  patient_password_mode: env.PATIENT_PASSWORD_MODE,
  permissions_enforce: env.PERMISSIONS_ENFORCE,
  reminders_engine: env.REMINDERS_ENGINE,
  default_phone_region: env.DEFAULT_PHONE_REGION.toUpperCase(),
  clinic_timezone: env.CLINIC_TIMEZONE,
  app_url: (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  api_url: (env.API_URL ?? `http://localhost:${env.PORT}/v1`).replace(/\/$/, ""),
  form_token_secret: env.FORM_TOKEN_SECRET || `form-token:${env.JWT_SECRET}`,
  turnstile: { site_key: env.TURNSTILE_SITE_KEY, secret_key: env.TURNSTILE_SECRET_KEY },
  leads: {
    export_max_rows: env.LEAD_EXPORT_MAX_ROWS,
    follow_up_remind_minutes: env.LEAD_FOLLOW_UP_REMIND_MINUTES,
    follow_up_reminder_cron: env.LEAD_FOLLOW_UP_REMINDER_CRON,
  },
  integrations: {
    encryption_key: env.INTEGRATION_ENCRYPTION_KEY,
    payload_retention_days: env.INTEGRATION_PAYLOAD_RETENTION_DAYS,
    import_max_rows: env.LEAD_IMPORT_MAX_ROWS,
    import_sheet_max_bytes: Math.round(env.LEAD_IMPORT_SHEET_MAX_MB * 1024 * 1024),
    oauth_state_secret: `oauth-state:${env.JWT_SECRET}`,
  },
  // WhatsApp Cloud API (per-practice numbers live in whatsapp_accounts).
  whatsapp_cloud: {
    app_secret: env.WHATSAPP_APP_SECRET || env.FACEBOOK_APP_SECRET,
    webhook_verify_token: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    graph_version: env.WHATSAPP_GRAPH_API_VERSION,
    campaign_send_interval_ms: env.WHATSAPP_CAMPAIGN_SEND_INTERVAL_MS,
  },
  facebook: {
    app_id: env.FACEBOOK_APP_ID,
    app_secret: env.FACEBOOK_APP_SECRET,
    webhook_verify_token: env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
    graph_version: env.FACEBOOK_GRAPH_API_VERSION,
    pull_sync_cron: env.FB_PULL_SYNC_CRON,
  },

  // http
  allowed_origins: env.ALLOWED_ORIGINS,
  rate_limit: { max: env.MAX_RATE_LIMIT, time_window: env.TIME_WINDOW },
  max_upload_bytes: Math.round(env.MAX_UPLOAD_MB * 1024 * 1024),

  // smtp
  smtp_from_email: env.SMTP_EMAIL,
  smtp_port: env.SMTP_PORT,
  smtp_host: env.SMTP_SERVER,
  smtp_password: env.SMTP_PASSWORD,
  email: {
    inbound_sync_cron: env.EMAIL_INBOUND_SYNC_CRON,
    campaign_interval_ms: env.EMAIL_CAMPAIGN_SEND_INTERVAL_MS,
  },
  patient_messages: {
    cron: env.PATIENT_MESSAGES_CRON,
    send_interval_ms: env.PATIENT_MESSAGE_SEND_INTERVAL_MS,
  },

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
