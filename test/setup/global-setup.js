// Recreates the test database once per `vitest run` and applies every
// migration, exactly like a fresh install.
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

  const { sequelize } = await import("../../app/db/postgres.js");
  const { createMigrator } = await import("../../app/db/migrator.js");
  await createMigrator(sequelize, { logger: undefined }).up();
  await sequelize.close();
}
