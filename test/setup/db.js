import { sequelize } from "../../app/db/postgres.js";

// Empties every table so each test file starts from a known state.
export async function resetDb() {
  const [rows] = await sequelize.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'SequelizeMeta'`,
  );
  if (rows.length) {
    const list = rows.map((r) => `"${r.tablename}"`).join(", ");
    await sequelize.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
  await sequelize.query(
    `INSERT INTO patient_sequences (id, value, created_at, updated_at)
     VALUES ('patient', 0, now(), now()) ON CONFLICT (id) DO NOTHING`,
  );
}

export const query = (sql, replacements = {}) =>
  sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
