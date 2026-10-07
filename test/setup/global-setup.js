// Recreates the test database once per `vitest run`. Tables are created by
// the app's own model init when the first test file boots the server.
import pg from "pg";
import { TEST_DB, applyTestEnv } from "./test-env.js";

export default async function globalSetup() {
  applyTestEnv();
  if (!/test/.test(TEST_DB)) {
    throw new Error(`Refusing to recreate "${TEST_DB}": name must contain "test".`);
  }
  const client = new pg.Client({
    host: process.env.PG_HOST,
    user: process.env.PG_USERNAME,
    password: process.env.PG_PASSWORD,
    port: Number(process.env.PG_PORT || 5432),
    database: "postgres",
  });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${TEST_DB}"`);
  await client.end();
}
