"use strict";
// Revamp M005–M011: database hardening.
//  1. Authorship FKs (added_by / created_by -> users) no longer cascade:
//     deleting a staff account must never delete the records they wrote.
//     NO ACTION (checked at statement end) still lets a patient's own rows
//     go when the patient is deleted.
//  2. users.deleted_at for soft-deleting staff/doctor accounts.
//  3. Soft delete for treatment_payments and ledgers: the tables become
//     *_records and views with the original names hide deleted rows, so
//     every existing query and balance excludes them automatically. DELETE
//     on the view marks the row deleted instead.
//  4. Unique pairs on mapping tables. Exact duplicate pairs (pure link rows)
//     are removed first; the removed rows are kept in _dedupe_backup so down
//     can restore them.
//  5. Indexes for hot paths and unindexed foreign keys.
//  6. patient_number_seq replaces the read-then-write patient counter.
//  7. clinics.contact_phone (was hardcoded in WhatsApp messages).

const SOFT_DELETE = [
  ["treatment_payments", "treatment_payment_records"],
  ["ledgers", "ledger_records"],
];

const UNIQUE_PAIRS = [
  ["clinic_patient_mappings", ["clinic_id", "patient_id"]],
  ["clinic_staff_mappings", ["clinic_id", "staff_id"]],
  ["doctor_patient_mappings", ["doctor_id", "patient_id"]],
  ["doctor_service_mappings", ["doctor_id", "service_id"]],
];
const UNIQUE_SINGLE = [
  ["doctors", "user_id"],
  ["patients", "user_id"],
  ["staffs", "user_id"],
];

const INDEXES = [
  ["bookings", ["clinic_id", "date", "slot"]],
  ["bookings", ["status", "date"]],
  ["bookings", ["patient_id"]],
  ["treatments", ["patient_id", "clinic_id"]],
  ["treatments", ["clinic_id"]],
  ["treatment_plans", ["treatment_id"]],
  ["treatment_plans", ["patient_id"]],
  ["treatment_payment_records", ["treatment_id"]],
  ["treatment_prescriptions", ["treatment_id"]],
  ["treatment_histories", ["treatment_id"]],
  ["investigations", ["treatment_id"]],
  ["xrays", ["treatment_id"]],
  ["notes", ["patient_id"]],
  ["documents", ["patient_id"]],
  ["comprehensive_examinations", ["patient_id"]],
  ["clinic_patient_mappings", ["patient_id"]],
  ["doctor_patient_mappings", ["patient_id"]],
  ["slots", ["doctor_id"]],
  ["blocked_slots", ["clinic_id", "date"]],
  ["clinics", ["doctor_id"]],
  ["staffs", ["doctor_id"]],
  ["users", ["mobile_number"]],
];
const indexName = (table, cols) => `${table}_${cols.join("_")}_idx`;

async function authorshipFks(q) {
  const [rows] = await q(`
    SELECT con.conname, rel.relname AS table_name, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'public'
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = 'public.users'::regclass
       AND att.attname IN ('added_by', 'created_by')`);
  return rows;
}

// cascade=false drops "ON DELETE CASCADE" (default NO ACTION); true adds it
// back. Everything else in the definition (e.g. DEFERRABLE) is preserved.
async function setAuthorshipFks(q, cascade) {
  for (const fk of await authorshipFks(q)) {
    const base = fk.def.replace(/ ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/, "");
    const def = cascade ? base.replace(/(REFERENCES \S+\(id\))/, "$1 ON DELETE CASCADE") : base;
    await q(`ALTER TABLE public."${fk.table_name}" DROP CONSTRAINT "${fk.conname}"`);
    await q(`ALTER TABLE public."${fk.table_name}" ADD CONSTRAINT "${fk.conname}" ${def}`);
  }
}

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, transaction });

    // 1
    await setAuthorshipFks(q, false);

    // 2
    await q(`ALTER TABLE public.users ADD COLUMN deleted_at timestamptz`);

    // 3
    for (const [view, table] of SOFT_DELETE) {
      await q(`ALTER TABLE public."${view}" RENAME TO "${table}"`);
      await q(`ALTER TABLE public."${table}" ADD COLUMN deleted_at timestamptz`);
      await q(`CREATE VIEW public."${view}" AS
                 SELECT * FROM public."${table}" WHERE deleted_at IS NULL`);
      await q(`
        CREATE FUNCTION public."${view}_soft_delete"() RETURNS trigger AS $$
        BEGIN
          UPDATE public."${table}" SET deleted_at = now(), updated_at = now() WHERE id = OLD.id;
          RETURN OLD;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER "${view}_soft_delete" INSTEAD OF DELETE ON public."${view}"
          FOR EACH ROW EXECUTE FUNCTION public."${view}_soft_delete"();
      `);
    }

    // 4
    await q(`CREATE TABLE public._dedupe_backup (table_name text NOT NULL, row_data jsonb NOT NULL,
               removed_at timestamptz NOT NULL DEFAULT now())`);
    for (const [table, cols] of UNIQUE_PAIRS) {
      const partition = cols.join(", ");
      await q(`
        WITH ranked AS (
          SELECT id, row_number() OVER (PARTITION BY ${partition} ORDER BY created_at, id) AS rn
            FROM public."${table}"
        ), removed AS (
          DELETE FROM public."${table}" t USING ranked r
           WHERE t.id = r.id AND r.rn > 1
          RETURNING t.*
        )
        INSERT INTO public._dedupe_backup (table_name, row_data)
        SELECT '${table}', to_jsonb(removed) FROM removed`);
      await q(`ALTER TABLE public."${table}" ADD CONSTRAINT "${table}_${cols.join("_")}_key"
                 UNIQUE (${partition})`);
    }
    for (const [table, col] of UNIQUE_SINGLE) {
      const [dups] = await q(
        `SELECT ${col} FROM public."${table}" GROUP BY ${col} HAVING count(*) > 1 LIMIT 5`,
      );
      if (dups.length) {
        throw new Error(
          `Hardening aborted: ${table}.${col} has duplicates (${dups.map((d) => d[col]).join(", ")}).`,
        );
      }
      await q(`ALTER TABLE public."${table}" ADD CONSTRAINT "${table}_${col}_key" UNIQUE (${col})`);
    }

    // 5
    for (const [table, cols] of INDEXES) {
      await q(`CREATE INDEX IF NOT EXISTS "${indexName(table, cols)}"
                 ON public."${table}" (${cols.map((c) => `"${c}"`).join(", ")})`);
    }

    // 6
    const [[{ value }]] = await q(
      `SELECT coalesce(max(value), 0) AS value FROM public.patient_sequences WHERE id = 'patient'`,
    );
    await q(`CREATE SEQUENCE public.patient_number_seq START WITH ${Number(value) + 1}`);

    // 7
    await q(`ALTER TABLE public.clinics ADD COLUMN contact_phone varchar(20) NOT NULL DEFAULT ''`);
    await q(`UPDATE public.clinics SET contact_phone = '8882850066'`);
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, transaction });

    await q(`ALTER TABLE public.clinics DROP COLUMN IF EXISTS contact_phone`);

    // keep patient numbers moving forward if the old counter comes back
    await q(`UPDATE public.patient_sequences
                SET value = GREATEST(value, (SELECT last_value FROM public.patient_number_seq)
                              - CASE WHEN (SELECT is_called FROM public.patient_number_seq) THEN 0 ELSE 1 END)
              WHERE id = 'patient'`);
    await q(`DROP SEQUENCE IF EXISTS public.patient_number_seq`);

    for (const [table, cols] of INDEXES) {
      await q(`DROP INDEX IF EXISTS public."${indexName(table, cols)}"`);
    }
    for (const [table, col] of UNIQUE_SINGLE) {
      await q(`ALTER TABLE public."${table}" DROP CONSTRAINT IF EXISTS "${table}_${col}_key"`);
    }
    for (const [table, cols] of UNIQUE_PAIRS) {
      await q(`ALTER TABLE public."${table}" DROP CONSTRAINT IF EXISTS "${table}_${cols.join("_")}_key"`);
      await q(`INSERT INTO public."${table}"
                 SELECT (jsonb_populate_record(NULL::public."${table}", row_data)).*
                   FROM public._dedupe_backup WHERE table_name = :table`, { table });
    }
    await q(`DROP TABLE IF EXISTS public._dedupe_backup`);

    for (const [view, table] of SOFT_DELETE) {
      const [[{ n }]] = await q(
        `SELECT count(*)::int AS n FROM public."${table}" WHERE deleted_at IS NOT NULL`,
      );
      if (n && process.env.FORCE_DROP_SOFT_DELETED !== "true") {
        throw new Error(
          `${table} has ${n} soft-deleted row(s); rolling back would make them visible again. ` +
            `Set FORCE_DROP_SOFT_DELETED=true to delete them permanently and continue.`,
        );
      }
      await q(`DROP VIEW public."${view}"`);
      await q(`DROP FUNCTION IF EXISTS public."${view}_soft_delete"()`);
      await q(`DELETE FROM public."${table}" WHERE deleted_at IS NOT NULL`);
      await q(`ALTER TABLE public."${table}" DROP COLUMN deleted_at`);
      await q(`ALTER TABLE public."${table}" RENAME TO "${view}"`);
    }

    await q(`ALTER TABLE public.users DROP COLUMN IF EXISTS deleted_at`);
    await setAuthorshipFks(q, true);
  });
}
