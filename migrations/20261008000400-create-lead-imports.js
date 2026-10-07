"use strict";
// Lead imports (Google add-on, revamp M034): CSV/XLSX uploads and shared
// Google Sheets. Rows are staged in lead_import_rows so an import can be
// previewed, dry-run, processed in the background (resumable) and leave an
// error report. Raw row data is cleared after the payload retention period.

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.sequelize.query(
      `
      CREATE TYPE public.enum_lead_imports_source_type AS ENUM ('file', 'google_sheet');
      CREATE TYPE public.enum_lead_imports_status AS ENUM ('draft', 'queued', 'running', 'completed', 'failed', 'cancelled');
      CREATE TYPE public.enum_lead_import_rows_status AS ENUM ('pending', 'created', 'flagged', 'merged', 'skipped', 'error');

      CREATE TABLE public.lead_imports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
        clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
        source_type public.enum_lead_imports_source_type NOT NULL,
        -- File name or "Google Sheet <id>"; never the full sheet link.
        source_name varchar(255) NOT NULL,
        status public.enum_lead_imports_status NOT NULL DEFAULT 'draft',
        headers jsonb NOT NULL DEFAULT '[]'::jsonb,
        -- { "<column header>": "full_name | first_name | last_name | phone | email | notes | cf:<key> | ignore" }
        mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
        pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
        stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
        dedupe_policy public.enum_integrations_dedupe NOT NULL DEFAULT 'skip',
        assignment varchar(20) NOT NULL DEFAULT 'round_robin',
        lead_source varchar(120) NOT NULL DEFAULT 'Import',
        total_rows int NOT NULL DEFAULT 0,
        processed_rows int NOT NULL DEFAULT 0,
        error_message text,
        started_at timestamptz,
        finished_at timestamptz,
        created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lead_imports_practice ON public.lead_imports (practice_id, created_at DESC);

      CREATE TABLE public.lead_import_rows (
        id bigserial PRIMARY KEY,
        import_id uuid NOT NULL REFERENCES public.lead_imports(id) ON DELETE CASCADE,
        practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
        row_number int NOT NULL,
        data jsonb,
        status public.enum_lead_import_rows_status NOT NULL DEFAULT 'pending',
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        message text,
        UNIQUE (import_id, row_number)
      );
      CREATE INDEX lead_import_rows_status ON public.lead_import_rows (import_id, status);
      `,
      { transaction },
    );
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS public.lead_import_rows;
    DROP TABLE IF EXISTS public.lead_imports;
    DROP TYPE IF EXISTS public.enum_lead_import_rows_status;
    DROP TYPE IF EXISTS public.enum_lead_imports_status;
    DROP TYPE IF EXISTS public.enum_lead_imports_source_type;
  `);
}
