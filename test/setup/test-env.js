// Shared by global-setup (separate process) and env.js (each test file).
import dotenv from "dotenv";

dotenv.config();

export const TEST_DB = process.env.TEST_PG_DATABASE || "drdipti_test";

export function applyTestEnv() {
  process.env.NODE_ENV = "test";
  process.env.PG_DATABASE = TEST_DB;
  process.env.PG_HOST = process.env.PG_HOST || "localhost";
  process.env.DB_DIALECT = process.env.DB_DIALECT || "postgres";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
  process.env.LEGACY_TOKEN_GRACE_UNTIL = "2999-01-01T00:00:00Z";
  process.env.PATIENT_PASSWORD_MODE = "random";
  process.env.SMTP_SERVER = "smtp.test";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_EMAIL = "clinic@test.dev";
  process.env.SMTP_PASSWORD = "smtp-test-password";
  process.env.PATIENT_MESSAGE_SEND_INTERVAL_MS = "0";
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.FACEBOOK_APP_ID = "test-app-id";
  process.env.FACEBOOK_APP_SECRET = "test-app-secret";
  process.env.WHATSAPP_APP_SECRET = "test-wa-secret";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-wa-verify";
  process.env.WHATSAPP_CAMPAIGN_SEND_INTERVAL_MS = "0";
  process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  process.env.APP_URL = "http://dashboard.test";
  process.env.API_URL = "http://api.test/v1";
  process.env.MAX_RATE_LIMIT = "100000";
  process.env.TIME_WINDOW = "1 minute";
  process.env.WAFFLY_LICENSE = "test-license";
  process.env.WAFFLY_API_KEY = "test-key";
  process.env.WAFFLY_TEMPLATE_BOOKING_CONFIRM = "booking_confirm";
  process.env.WAFFLY_TEMPLATE_24_HOURS_BEFORE_APPOINTMENT = "reminder_24h";
  process.env.WAFFLY_TEMPLATE_2_HRS_BEFORE_APPOINTMENT = "reminder_2h";
  process.env.WAFFLY_TEMPLATE_1_HR_AFTER_APPOINTMENT = "follow_up";
  process.env.WAFFLY_TEMPLATE_REVIEW_MESAAGE = "review";
}
