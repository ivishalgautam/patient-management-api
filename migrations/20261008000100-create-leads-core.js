"use strict";
// Leads module core (revamp M020–M029). Every table is practice-scoped;
// clinic_id narrows a pipeline/form/lead to one clinic (NULL = practice-wide).
// Soft delete via deleted_at on leads and forms; pipelines/stages/custom
// fields are archived instead of deleted.

const TABLES = [
  "practice_features",
  "pipelines",
  "pipeline_stages",
  "pipeline_members",
  "tags",
  "custom_fields",
  "forms",
  "form_fields",
  "leads",
  "lead_tags",
  "lead_custom_field_values",
  "lead_stage_history",
  "lead_activities",
  "form_submissions",
];
const TYPES = [
  "enum_pipeline_stages_stage_type",
  "enum_leads_status",
  "enum_lead_activities_type",
  "enum_custom_fields_field_type",
  "enum_form_fields_source",
  "enum_forms_assignment",
  "enum_form_submissions_status",
];

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const audit = `
      created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
      updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()`;
    const practice = `practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE`;
    const clinic = `clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL`;

    // Trigram index for lead name search (trusted extension, PG13+).
    await q(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await q(`
      CREATE TYPE public.enum_pipeline_stages_stage_type AS ENUM ('open', 'won', 'lost');
      CREATE TYPE public.enum_leads_status AS ENUM ('open', 'won', 'lost', 'converted');
      CREATE TYPE public.enum_lead_activities_type AS ENUM (
        'note', 'call', 'whatsapp', 'email', 'meeting', 'follow_up', 'stage_change',
        'assignment', 'created', 'updated', 'form_submission', 'integration', 'conversion');
      CREATE TYPE public.enum_custom_fields_field_type AS ENUM (
        'text', 'textarea', 'number', 'date', 'dropdown', 'multi_select', 'checkbox',
        'phone', 'email', 'url');
      CREATE TYPE public.enum_form_fields_source AS ENUM ('core', 'custom');
      CREATE TYPE public.enum_forms_assignment AS ENUM ('round_robin', 'fixed', 'none');
      CREATE TYPE public.enum_form_submissions_status AS ENUM ('accepted', 'duplicate', 'spam', 'error');

      -- Optional add-ons per practice (or per clinic).
      CREATE TABLE public.practice_features (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice}, ${clinic},
        feature_key varchar(64) NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        ${audit}
      );
      CREATE UNIQUE INDEX practice_features_scope_key ON public.practice_features
        (practice_id, coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid), feature_key);

      CREATE TABLE public.pipelines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice}, ${clinic},
        name varchar(120) NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        last_assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
        ${audit}
      );
      CREATE INDEX pipelines_practice_clinic ON public.pipelines (practice_id, clinic_id);
      -- One default (non-archived) pipeline per practice.
      CREATE UNIQUE INDEX pipelines_one_default ON public.pipelines (practice_id)
        WHERE is_default AND archived_at IS NULL;

      CREATE TABLE public.pipeline_stages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
        name varchar(120) NOT NULL,
        position integer NOT NULL,
        color varchar(16) NOT NULL DEFAULT '#64748b',
        probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
        stage_type public.enum_pipeline_stages_stage_type NOT NULL DEFAULT 'open',
        -- Lead fields that must be filled before entering this stage:
        -- core keys (email, phone, ...) or "cf:<custom_field_key>".
        required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        archived_at timestamptz,
        ${audit},
        CONSTRAINT pipeline_stages_position_key UNIQUE (pipeline_id, position) DEFERRABLE INITIALLY IMMEDIATE
      );
      CREATE INDEX pipeline_stages_pipeline_id ON public.pipeline_stages (pipeline_id);

      -- Round-robin pool for automatic assignment.
      CREATE TABLE public.pipeline_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pipeline_members_pipeline_user_key UNIQUE (pipeline_id, user_id)
      );

      CREATE TABLE public.tags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(60) NOT NULL,
        color varchar(16) NOT NULL DEFAULT '#64748b',
        ${audit}
      );
      CREATE UNIQUE INDEX tags_practice_name ON public.tags (practice_id, lower(name));

      CREATE TABLE public.custom_fields (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        entity varchar(32) NOT NULL DEFAULT 'lead',
        key varchar(64) NOT NULL,
        label varchar(120) NOT NULL,
        field_type public.enum_custom_fields_field_type NOT NULL,
        options jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_filterable boolean NOT NULL DEFAULT false,
        position integer NOT NULL DEFAULT 0,
        archived_at timestamptz,
        ${audit},
        CONSTRAINT custom_fields_practice_entity_key UNIQUE (practice_id, entity, key)
      );

      CREATE TABLE public.forms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice}, ${clinic},
        name varchar(120) NOT NULL,
        slug varchar(80) NOT NULL UNIQUE,
        pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
        stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
        is_active boolean NOT NULL DEFAULT true,
        -- thank_you_message, redirect_url, theme, spam: { honeypot, min_seconds, turnstile }
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        assignment public.enum_forms_assignment NOT NULL DEFAULT 'round_robin',
        fixed_owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
        deleted_at timestamptz,
        ${audit}
      );
      CREATE UNIQUE INDEX forms_practice_name ON public.forms (practice_id, lower(name)) WHERE deleted_at IS NULL;

      CREATE TABLE public.form_fields (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
        source public.enum_form_fields_source NOT NULL,
        core_key varchar(32),
        custom_field_id uuid REFERENCES public.custom_fields(id) ON DELETE CASCADE,
        label_override varchar(120),
        placeholder varchar(160),
        is_required boolean NOT NULL DEFAULT false,
        validation jsonb NOT NULL DEFAULT '{}'::jsonb,
        section varchar(80),
        position integer NOT NULL DEFAULT 0,
        width varchar(8) NOT NULL DEFAULT 'full' CHECK (width IN ('full', 'half')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((source = 'core' AND core_key IS NOT NULL) OR (source = 'custom' AND custom_field_id IS NOT NULL))
      );
      CREATE INDEX form_fields_form_position ON public.form_fields (form_id, position);

      CREATE TABLE public.leads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice}, ${clinic},
        pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
        stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
        owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
        full_name varchar(160) NOT NULL,
        phone varchar(32),
        phone_normalized varchar(20),
        email varchar(160),
        email_normalized varchar(160),
        source varchar(60) NOT NULL DEFAULT 'manual',
        sub_source varchar(120),
        status public.enum_leads_status NOT NULL DEFAULT 'open',
        lost_reason varchar(255),
        notes text,
        next_follow_up_at timestamptz,
        last_activity_at timestamptz,
        form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL,
        integration_id uuid,
        duplicate_of_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        converted_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
        converted_at timestamptz,
        converted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        deleted_at timestamptz,
        ${audit}
      );
      CREATE INDEX leads_board ON public.leads (practice_id, pipeline_id, stage_id) WHERE deleted_at IS NULL;
      CREATE INDEX leads_owner_status ON public.leads (practice_id, owner_id, status) WHERE deleted_at IS NULL;
      CREATE INDEX leads_phone ON public.leads (practice_id, phone_normalized) WHERE deleted_at IS NULL;
      CREATE INDEX leads_email ON public.leads (practice_id, email_normalized) WHERE deleted_at IS NULL;
      CREATE INDEX leads_follow_up ON public.leads (practice_id, next_follow_up_at) WHERE deleted_at IS NULL;
      CREATE INDEX leads_created ON public.leads (practice_id, created_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX leads_source ON public.leads (practice_id, source) WHERE deleted_at IS NULL;
      CREATE INDEX leads_name_search ON public.leads USING gin (lower(full_name) gin_trgm_ops);

      CREATE TABLE public.lead_tags (
        lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
        tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (lead_id, tag_id)
      );
      CREATE INDEX lead_tags_tag_id ON public.lead_tags (tag_id);

      -- Typed custom field values: one row per lead and field, indexed by type.
      CREATE TABLE public.lead_custom_field_values (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
        custom_field_id uuid NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
        value_text text,
        value_number numeric,
        value_date date,
        value_bool boolean,
        value_json jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT lead_cf_values_lead_field_key UNIQUE (lead_id, custom_field_id)
      );
      CREATE INDEX lead_cf_values_text ON public.lead_custom_field_values (custom_field_id, value_text);
      CREATE INDEX lead_cf_values_number ON public.lead_custom_field_values (custom_field_id, value_number);
      CREATE INDEX lead_cf_values_date ON public.lead_custom_field_values (custom_field_id, value_date);
      CREATE INDEX lead_cf_values_json ON public.lead_custom_field_values USING gin (value_json);

      CREATE TABLE public.lead_stage_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
        from_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
        to_stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
        changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        changed_at timestamptz NOT NULL DEFAULT now(),
        seconds_in_previous_stage integer
      );
      CREATE INDEX lead_stage_history_lead ON public.lead_stage_history (lead_id, changed_at);

      CREATE TABLE public.lead_activities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
        type public.enum_lead_activities_type NOT NULL,
        body text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        due_at timestamptz,
        completed_at timestamptz,
        ${audit}
      );
      CREATE INDEX lead_activities_timeline ON public.lead_activities (lead_id, created_at DESC);
      CREATE INDEX lead_activities_due ON public.lead_activities (practice_id, due_at) WHERE completed_at IS NULL AND due_at IS NOT NULL;

      -- What a public form visitor submitted (snapshot), whatever happened next.
      CREATE TABLE public.form_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        payload jsonb NOT NULL,
        ip_hash varchar(64),
        user_agent varchar(255),
        status public.enum_form_submissions_status NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX form_submissions_form_created ON public.form_submissions (form_id, created_at DESC);

      ALTER TABLE public.patients ADD COLUMN source_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
    `);
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`ALTER TABLE public.patients DROP COLUMN IF EXISTS source_lead_id`);
    for (const t of [...TABLES].reverse()) await q(`DROP TABLE IF EXISTS public."${t}" CASCADE`);
    for (const t of TYPES) await q(`DROP TYPE IF EXISTS public."${t}"`);
  });
}
