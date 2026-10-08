"use strict";
// Chair / cabin scheduling (Dentee-style appointment board): chairs per
// clinic, the chair an appointment is in, and the patient's journey
// timestamps (arrived, seated, finished) for waiting-time analysis.

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      CREATE TABLE public.chairs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
        clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
        name varchar(60) NOT NULL,
        color varchar(9) NOT NULL DEFAULT '#0ea5e9',
        position int NOT NULL DEFAULT 0,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX chairs_clinic_name ON public.chairs (clinic_id, lower(name)) WHERE archived_at IS NULL;

      ALTER TABLE public.bookings
        ADD COLUMN chair_id uuid REFERENCES public.chairs(id) ON DELETE SET NULL,
        ADD COLUMN checked_in_at timestamptz,
        ADD COLUMN seated_at timestamptz,
        ADD COLUMN finished_at timestamptz;
      CREATE INDEX bookings_clinic_date_chair ON public.bookings (clinic_id, date, chair_id);
    `);
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      DROP INDEX IF EXISTS public.bookings_clinic_date_chair;
      ALTER TABLE public.bookings
        DROP COLUMN IF EXISTS chair_id,
        DROP COLUMN IF EXISTS checked_in_at,
        DROP COLUMN IF EXISTS seated_at,
        DROP COLUMN IF EXISTS finished_at;
      DROP TABLE IF EXISTS public.chairs;
    `);
  });
}
