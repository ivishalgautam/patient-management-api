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
  process.env.MAX_RATE_LIMIT = "100000";
  process.env.TIME_WINDOW = "1 minute";
  process.env.WAFFLY_LICENSE = "test-license";
  process.env.WAFFLY_API_KEY = "test-key";
}
