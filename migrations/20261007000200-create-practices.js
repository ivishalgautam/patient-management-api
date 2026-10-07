"use strict";
// Tenancy (revamp M001–M003): a practice is the tenant. Today every doctor
// owns their clinics, staff and patients, so each doctor becomes one
// practice. practice_id is added to the owner tables, backfilled, then made
// NOT NULL. Triggers fill practice_id on insert from the parent row so code
// paths that don't know about practices keep working.
//
// Backfill aborts (and changes nothing) if a patient is linked to more than
// one doctor, or if unlinked patients can't be assigned (see below).

const OWNED_BY_CLINIC = ["bookings", "treatments", "ledgers", "slots", "blocked_slots"];
const OWNED_BY_PATIENT = ["notes", "documents", "comprehensive_examinations"];
const OWNED_BY_DOCTOR = ["clinics", "staffs"];
const NOT_NULL_TABLES = [
  "doctors",
  ...OWNED_BY_DOCTOR,
  "patients",
  ...OWNED_BY_CLINIC,
  ...OWNED_BY_PATIENT,
];
// users.practice_id stays nullable: platform admins have none.
const ALL_TABLES = ["users", ...NOT_NULL_TABLES];

export async function up({ context: queryInterface }) {
  // One transaction: an aborted backfill leaves the database untouched.
  await queryInterface.sequelize.transaction((transaction) =>
    migrate((sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, transaction }),
    ),
  );
}

async function migrate(q) {

  await q(`
    CREATE TYPE public.enum_practices_status AS ENUM ('active', 'suspended');
    CREATE TABLE public.practices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(255) NOT NULL,
      owner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
      status public.enum_practices_status NOT NULL DEFAULT 'active',
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX practices_owner_user_id ON public.practices (owner_user_id);
  `);

  for (const table of ALL_TABLES) {
    await q(`ALTER TABLE public."${table}"
      ADD COLUMN practice_id uuid REFERENCES public.practices(id) ON DELETE RESTRICT`);
  }

  // --- backfill -----------------------------------------------------------
  await q(`
    WITH created AS (
      INSERT INTO public.practices (name, owner_user_id)
      SELECT coalesce(nullif(u.fullname, ''), 'Practice') || ' Practice', d.user_id
        FROM public.doctors d JOIN public.users u ON u.id = d.user_id
      RETURNING id, owner_user_id
    )
    UPDATE public.doctors d SET practice_id = c.id
      FROM created c WHERE c.owner_user_id = d.user_id;

    UPDATE public.clinics x SET practice_id = d.practice_id FROM public.doctors d WHERE d.id = x.doctor_id;
    UPDATE public.staffs x SET practice_id = d.practice_id FROM public.doctors d WHERE d.id = x.doctor_id;
  `);
  for (const table of OWNED_BY_CLINIC) {
    await q(`UPDATE public."${table}" x SET practice_id = c.practice_id
               FROM public.clinics c WHERE c.id = x.clinic_id`);
  }

  // Every way a patient is linked to a practice today.
  await q(`
    CREATE TEMP TABLE patient_practice_links ON COMMIT DROP AS
    SELECT DISTINCT patient_id, practice_id FROM (
      SELECT m.patient_id, d.practice_id FROM public.doctor_patient_mappings m JOIN public.doctors d ON d.id = m.doctor_id
      UNION SELECT m.patient_id, c.practice_id FROM public.clinic_patient_mappings m JOIN public.clinics c ON c.id = m.clinic_id
      UNION SELECT patient_id, practice_id FROM public.bookings
      UNION SELECT patient_id, practice_id FROM public.treatments
      UNION SELECT patient_id, practice_id FROM public.ledgers
    ) links WHERE practice_id IS NOT NULL;
  `);
  const [shared] = await q(`
    SELECT patient_id FROM patient_practice_links GROUP BY patient_id HAVING count(*) > 1`);
  if (shared.length) {
    throw new Error(
      `Tenancy backfill aborted: ${shared.length} patient(s) are linked to more than one doctor ` +
        `(e.g. ${shared.slice(0, 5).map((r) => r.patient_id).join(", ")}). Decide which practice ` +
        `owns them before migrating.`,
    );
  }
  await q(`UPDATE public.patients p SET practice_id = l.practice_id
             FROM patient_practice_links l WHERE l.patient_id = p.id`);

  // Patients with no clinic/doctor link at all (e.g. self-registered).
  const [[{ n: unlinked }]] = await q(
    `SELECT count(*)::int AS n FROM public.patients WHERE practice_id IS NULL`,
  );
  if (unlinked) {
    const [practices] = await q(`SELECT id FROM public.practices`);
    const target =
      process.env.UNLINKED_PATIENT_PRACTICE_ID || (practices.length === 1 ? practices[0].id : null);
    if (!target) {
      throw new Error(
        `Tenancy backfill aborted: ${unlinked} patient(s) have no clinic or doctor link and there ` +
          `are ${practices.length} practices. Set UNLINKED_PATIENT_PRACTICE_ID to assign them.`,
      );
    }
    await q(`UPDATE public.patients SET practice_id = :target WHERE practice_id IS NULL`, { target });
  }

  for (const table of OWNED_BY_PATIENT) {
    await q(`UPDATE public."${table}" x SET practice_id = p.practice_id
               FROM public.patients p WHERE p.id = x.patient_id`);
  }
  await q(`
    UPDATE public.users u SET practice_id = d.practice_id FROM public.doctors d WHERE d.user_id = u.id;
    UPDATE public.users u SET practice_id = s.practice_id FROM public.staffs s WHERE s.user_id = u.id;
    UPDATE public.users u SET practice_id = p.practice_id FROM public.patients p WHERE p.user_id = u.id;
  `);

  for (const table of NOT_NULL_TABLES) {
    await q(`ALTER TABLE public."${table}" ALTER COLUMN practice_id SET NOT NULL`);
  }
  for (const table of ALL_TABLES) {
    await q(`CREATE INDEX "${table}_practice_id" ON public."${table}" (practice_id)`);
  }

  // --- keep practice_id filled on insert ---------------------------------
  await q(`
    -- A new doctor without a practice gets one (owner = the doctor's user).
    CREATE FUNCTION public.doctors_ensure_practice() RETURNS trigger AS $$
    BEGIN
      IF NEW.practice_id IS NULL THEN
        INSERT INTO public.practices (name, owner_user_id)
        SELECT coalesce(nullif(u.fullname, ''), 'Practice') || ' Practice', NEW.user_id
          FROM public.users u WHERE u.id = NEW.user_id
        RETURNING id INTO NEW.practice_id;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    CREATE TRIGGER doctors_ensure_practice BEFORE INSERT ON public.doctors
      FOR EACH ROW EXECUTE FUNCTION public.doctors_ensure_practice();

    CREATE FUNCTION public.set_practice_from_doctor() RETURNS trigger AS $$
    BEGIN
      IF NEW.practice_id IS NULL THEN
        SELECT practice_id INTO NEW.practice_id FROM public.doctors WHERE id = NEW.doctor_id;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    CREATE FUNCTION public.set_practice_from_clinic() RETURNS trigger AS $$
    BEGIN
      IF NEW.practice_id IS NULL THEN
        SELECT practice_id INTO NEW.practice_id FROM public.clinics WHERE id = NEW.clinic_id;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    CREATE FUNCTION public.set_practice_from_patient() RETURNS trigger AS $$
    BEGIN
      IF NEW.practice_id IS NULL THEN
        SELECT practice_id INTO NEW.practice_id FROM public.patients WHERE id = NEW.patient_id;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    -- The user row mirrors the practice of their doctor/staff/patient row.
    CREATE FUNCTION public.sync_user_practice() RETURNS trigger AS $$
    BEGIN
      UPDATE public.users SET practice_id = NEW.practice_id
       WHERE id = NEW.user_id AND practice_id IS DISTINCT FROM NEW.practice_id;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
  `);
  for (const table of OWNED_BY_DOCTOR) {
    await q(`CREATE TRIGGER "${table}_set_practice" BEFORE INSERT ON public."${table}"
               FOR EACH ROW EXECUTE FUNCTION public.set_practice_from_doctor()`);
  }
  for (const table of OWNED_BY_CLINIC) {
    await q(`CREATE TRIGGER "${table}_set_practice" BEFORE INSERT ON public."${table}"
               FOR EACH ROW EXECUTE FUNCTION public.set_practice_from_clinic()`);
  }
  for (const table of OWNED_BY_PATIENT) {
    await q(`CREATE TRIGGER "${table}_set_practice" BEFORE INSERT ON public."${table}"
               FOR EACH ROW EXECUTE FUNCTION public.set_practice_from_patient()`);
  }
  for (const table of ["doctors", "staffs", "patients"]) {
    await q(`CREATE TRIGGER "${table}_sync_user_practice" AFTER INSERT ON public."${table}"
               FOR EACH ROW EXECUTE FUNCTION public.sync_user_practice()`);
  }
}

export async function down({ context: queryInterface }) {
  const q = (sql) => queryInterface.sequelize.query(sql);
  for (const table of [...OWNED_BY_DOCTOR, ...OWNED_BY_CLINIC, ...OWNED_BY_PATIENT]) {
    await q(`DROP TRIGGER IF EXISTS "${table}_set_practice" ON public."${table}"`);
  }
  for (const table of ["doctors", "staffs", "patients"]) {
    await q(`DROP TRIGGER IF EXISTS "${table}_sync_user_practice" ON public."${table}"`);
  }
  await q(`DROP TRIGGER IF EXISTS doctors_ensure_practice ON public.doctors`);
  await q(`
    DROP FUNCTION IF EXISTS public.doctors_ensure_practice();
    DROP FUNCTION IF EXISTS public.set_practice_from_doctor();
    DROP FUNCTION IF EXISTS public.set_practice_from_clinic();
    DROP FUNCTION IF EXISTS public.set_practice_from_patient();
    DROP FUNCTION IF EXISTS public.sync_user_practice();
  `);
  for (const table of ALL_TABLES) {
    await q(`ALTER TABLE public."${table}" DROP COLUMN IF EXISTS practice_id`);
  }
  await q(`DROP TABLE IF EXISTS public.practices`);
  await q(`DROP TYPE IF EXISTS public.enum_practices_status`);
}
