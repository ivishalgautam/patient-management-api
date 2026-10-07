"use strict";
// M000 — schema of the dental API before the revamp (see migrations/sql).
// Existing databases: mark as applied with `npm run migrate:baseline`.
// Fresh databases: `npm run migrate:up` creates everything.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SQL_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "sql/00000000000000-baseline.sql",
);

const readSql = () => fs.readFileSync(SQL_FILE, "utf8");

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.query(readSql());
  // Previously created at boot by patient-sequence.model.js.
  await queryInterface.sequelize.query(
    `INSERT INTO public.patient_sequences (id, value, created_at, updated_at)
     VALUES ('patient', 0, now(), now()) ON CONFLICT (id) DO NOTHING`,
  );
}

export async function down({ context: queryInterface }) {
  const sql = readSql();
  const tables = [...sql.matchAll(/CREATE TABLE public\.(\w+)/g)].map((m) => m[1]);
  const types = [...sql.matchAll(/CREATE TYPE public\.(\w+)/g)].map((m) => m[1]);
  for (const t of tables) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS public."${t}" CASCADE`);
  }
  for (const t of types) {
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS public."${t}" CASCADE`);
  }
}
