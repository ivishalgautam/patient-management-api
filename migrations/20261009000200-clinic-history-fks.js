"use strict";
// Revamp M036 (audit #24): deleting a clinic must never delete its
// appointments, treatments (and everything under them) or ledger entries.
// Those clinic_id foreign keys stop cascading (NO ACTION), so the database
// refuses the delete; the API answers 409 before it gets that far.
// Schedules, blocked slots and staff/patient links still go with the clinic.

const TABLES = ["bookings", "treatments", "ledger_records"];

async function clinicFks(q) {
  const [rows] = await q(`
    SELECT con.conname, rel.relname AS table_name, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'public'
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = 'public.clinics'::regclass
       AND att.attname = 'clinic_id'
       AND rel.relname IN (${TABLES.map((t) => `'${t}'`).join(", ")})`);
  return rows;
}

// cascade=false drops "ON DELETE CASCADE"; true adds it back. The rest of
// the definition (e.g. DEFERRABLE) is preserved.
async function setClinicFks(q, cascade) {
  for (const fk of await clinicFks(q)) {
    const base = fk.def.replace(/ ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/, "");
    const def = cascade ? base.replace(/(REFERENCES \S+\(id\))/, "$1 ON DELETE CASCADE") : base;
    await q(`ALTER TABLE public."${fk.table_name}" DROP CONSTRAINT "${fk.conname}"`);
    await q(`ALTER TABLE public."${fk.table_name}" ADD CONSTRAINT "${fk.conname}" ${def}`);
  }
}

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await setClinicFks((sql) => queryInterface.sequelize.query(sql, { transaction }), false);
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await setClinicFks((sql) => queryInterface.sequelize.query(sql, { transaction }), true);
  });
}
