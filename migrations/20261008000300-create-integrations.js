"use strict";
// Lead integrations (revamp M030–M033): connected sources (Facebook Lead
// Ads, custom webhooks, Google add-on), their event log, provider lead refs
// for dedupe, and short-lived OAuth hand-off sessions.

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    CREATE TYPE public.enum_integrations_status AS ENUM ('active', 'error', 'disabled', 'needs_reauth');
    CREATE TYPE public.enum_integrations_dedupe AS ENUM ('merge', 'create_flagged', 'skip');
    CREATE TYPE public.enum_integration_events_direction AS ENUM ('inbound', 'pull', 'import', 'test', 'retry');
    CREATE TYPE public.enum_integration_events_status AS ENUM ('queued', 'processed', 'duplicate', 'ignored', 'error');

    CREATE TABLE public.integrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
      clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
      provider_key varchar(40) NOT NULL,
      name varchar(120) NOT NULL,
      status public.enum_integrations_status NOT NULL DEFAULT 'active',
      -- AES-256-GCM encrypted JSON (tokens, shared keys). Never returned by the API.
      secrets_encrypted text,
      -- Unguessable token in the public webhook URL (webhook providers).
      webhook_token varchar(64) UNIQUE,
      -- Provider account ids (e.g. Facebook page/form). Not secret.
      account_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
      default_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
      default_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
      -- { "<provider field>": "<core key> | cf:<custom key> | ignore" }
      field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
      dedupe_policy public.enum_integrations_dedupe NOT NULL DEFAULT 'merge',
      token_expires_at timestamptz,
      last_event_at timestamptz,
      last_synced_at timestamptz,
      last_error text,
      installed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX integrations_practice ON public.integrations (practice_id, provider_key);
    CREATE INDEX integrations_fb_page ON public.integrations ((account_ref->>'page_id')) WHERE provider_key = 'facebook_leads';

    ALTER TABLE public.leads
      ADD CONSTRAINT leads_integration_id_fkey FOREIGN KEY (integration_id)
      REFERENCES public.integrations(id) ON DELETE SET NULL;

    -- Integration log: every delivery/pull/import attempt and its outcome.
    CREATE TABLE public.integration_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
      integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
      direction public.enum_integration_events_direction NOT NULL,
      status public.enum_integration_events_status NOT NULL,
      provider_lead_id varchar(255),
      lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
      -- PII masked; kept for the log.
      payload_redacted jsonb,
      -- Full payload, encrypted, for replay; purged after the retention period.
      payload_encrypted text,
      error_message text,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX integration_events_log ON public.integration_events (integration_id, created_at DESC);
    CREATE INDEX integration_events_status ON public.integration_events (status) WHERE status IN ('queued', 'error');
    CREATE INDEX integration_events_purge ON public.integration_events (created_at) WHERE payload_encrypted IS NOT NULL;

    -- Provider lead id -> lead, so the same delivery never creates two leads.
    CREATE TABLE public.integration_lead_refs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
      provider_lead_id varchar(255) NOT NULL,
      lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT integration_lead_refs_key UNIQUE (integration_id, provider_lead_id)
    );

    -- OAuth hand-off between the provider callback and the admin's page
    -- picker; bound to the practice and user that started it.
    CREATE TABLE public.oauth_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      provider_key varchar(40) NOT NULL,
      payload_encrypted text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX oauth_sessions_expires ON public.oauth_sessions (expires_at);
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_integration_id_fkey;
    DROP TABLE IF EXISTS public.oauth_sessions;
    DROP TABLE IF EXISTS public.integration_lead_refs;
    DROP TABLE IF EXISTS public.integration_events;
    DROP TABLE IF EXISTS public.integrations;
    DROP TYPE IF EXISTS public.enum_integration_events_status;
    DROP TYPE IF EXISTS public.enum_integration_events_direction;
    DROP TYPE IF EXISTS public.enum_integrations_dedupe;
    DROP TYPE IF EXISTS public.enum_integrations_status;
  `);
}
