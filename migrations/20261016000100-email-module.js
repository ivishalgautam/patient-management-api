"use strict";
// Full email module (modelled on BW Task's email module): several email
// accounts per practice (SMTP to send, IMAP to receive), a mailbox of sent
// and received messages, block-built templates, campaigns, and automation
// rules on lead events. Replaces the single-account email_settings table
// from 20261015000100: its account (if any) becomes the default account.
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

const TABLES = [
  "email_automation_runs",
  "email_automation_rules",
  "email_campaign_recipients",
  "email_campaigns",
  "email_messages",
  "email_templates",
  "email_settings",
  "email_accounts",
];
const TYPES = [
  "enum_email_accounts_status",
  "enum_email_messages_direction",
  "enum_email_messages_folder",
  "enum_email_messages_status",
  "enum_email_campaigns_status",
  "enum_email_campaigns_audience",
  "enum_email_recipients_status",
  "enum_email_runs_status",
];

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const practice = `practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE`;
    const by = (col) => `${col} uuid REFERENCES public.users(id) ON DELETE SET NULL`;
    await q(`
      CREATE TYPE public.enum_email_accounts_status AS ENUM ('connected', 'error', 'paused');
      CREATE TYPE public.enum_email_messages_direction AS ENUM ('inbound', 'outbound');
      CREATE TYPE public.enum_email_messages_folder AS ENUM ('inbox', 'sent', 'trash');
      CREATE TYPE public.enum_email_messages_status AS ENUM ('queued', 'sent', 'failed', 'received');
      CREATE TYPE public.enum_email_campaigns_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled');
      CREATE TYPE public.enum_email_campaigns_audience AS ENUM ('leads', 'patients', 'upload');
      CREATE TYPE public.enum_email_recipients_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
      CREATE TYPE public.enum_email_runs_status AS ENUM ('sent', 'failed', 'skipped');

      -- Credentials (password) are AES-256-GCM encrypted and never returned.
      CREATE TABLE public.email_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        provider varchar(30) NOT NULL DEFAULT 'other',
        email_address varchar(255) NOT NULL,
        display_name varchar(120),
        smtp_host varchar(255) NOT NULL,
        smtp_port int NOT NULL,
        smtp_secure boolean NOT NULL DEFAULT false,
        imap_host varchar(255),
        imap_port int,
        imap_secure boolean NOT NULL DEFAULT true,
        auth_user varchar(255),
        credentials_encrypted text NOT NULL,
        status public.enum_email_accounts_status NOT NULL DEFAULT 'connected',
        sync_inbound boolean NOT NULL DEFAULT true,
        imap_uid_validity bigint,
        imap_last_uid bigint,
        last_synced_at timestamptz,
        last_error text,
        is_default boolean NOT NULL DEFAULT false,
        ${by("created_by")},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX email_accounts_address ON public.email_accounts (practice_id, lower(email_address));
      CREATE UNIQUE INDEX email_accounts_one_default ON public.email_accounts (practice_id) WHERE is_default;

      INSERT INTO public.email_accounts (practice_id, provider, email_address, display_name, smtp_host, smtp_port, smtp_secure,
                                         auth_user, credentials_encrypted, status, sync_inbound, last_error, is_default, created_by)
      SELECT practice_id, 'other', from_email, from_name, host, port, secure, username, password_encrypted,
             CASE WHEN is_active THEN 'connected' ELSE 'paused' END::public.enum_email_accounts_status, false, last_error, true, updated_by
        FROM public.email_settings;
    `);
    // The old table stored {password} encrypted; email_accounts reuses it
    // as-is (credentials_encrypted holds {password}).
    await q(`DROP TABLE public.email_settings`);
    await q(`
      CREATE TABLE public.email_settings (
        practice_id uuid PRIMARY KEY REFERENCES public.practices(id) ON DELETE CASCADE,
        is_enabled boolean NOT NULL DEFAULT true,
        default_from_name varchar(120),
        default_account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
        signature text,
        ${by("updated_by")},
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.email_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        subject varchar(255) NOT NULL,
        category varchar(40) NOT NULL DEFAULT 'general',
        builder_type varchar(10) NOT NULL DEFAULT 'blocks' CHECK (builder_type IN ('blocks', 'html')),
        content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
        body_html text NOT NULL DEFAULT '',
        body_text text NOT NULL DEFAULT '',
        is_active boolean NOT NULL DEFAULT true,
        ${by("created_by")},
        ${by("updated_by")},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
      CREATE INDEX email_templates_practice ON public.email_templates (practice_id) WHERE deleted_at IS NULL;

      CREATE TABLE public.email_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE RESTRICT,
        account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
        audience_type public.enum_email_campaigns_audience NOT NULL,
        audience jsonb NOT NULL DEFAULT '{}'::jsonb,
        status public.enum_email_campaigns_status NOT NULL DEFAULT 'draft',
        scheduled_at timestamptz,
        started_at timestamptz,
        sent_at timestamptz,
        ${by("created_by")},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX email_campaigns_practice ON public.email_campaigns (practice_id, created_at DESC);
      CREATE INDEX email_campaigns_scheduled ON public.email_campaigns (scheduled_at) WHERE status = 'scheduled';

      CREATE TABLE public.email_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
        direction public.enum_email_messages_direction NOT NULL,
        folder public.enum_email_messages_folder NOT NULL,
        status public.enum_email_messages_status NOT NULL,
        from_address varchar(255) NOT NULL,
        from_name varchar(255),
        to_addresses text[] NOT NULL DEFAULT '{}',
        cc_addresses text[] NOT NULL DEFAULT '{}',
        bcc_addresses text[] NOT NULL DEFAULT '{}',
        subject varchar(998) NOT NULL DEFAULT '',
        body_html text,
        body_text text,
        template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
        campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
        provider_message_id varchar(998),
        in_reply_to varchar(998),
        thread_id uuid NOT NULL DEFAULT gen_random_uuid(),
        is_read boolean NOT NULL DEFAULT true,
        error_message text,
        sent_at timestamptz,
        received_at timestamptz,
        ${by("created_by")},
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX email_messages_folder ON public.email_messages (practice_id, folder, created_at DESC);
      CREATE INDEX email_messages_thread ON public.email_messages (thread_id, created_at);
      CREATE INDEX email_messages_lead ON public.email_messages (lead_id) WHERE lead_id IS NOT NULL;
      CREATE INDEX email_messages_patient ON public.email_messages (patient_id) WHERE patient_id IS NOT NULL;
      CREATE INDEX email_messages_queued ON public.email_messages (created_at) WHERE status = 'queued';
      CREATE UNIQUE INDEX email_messages_provider_id ON public.email_messages (account_id, provider_message_id)
        WHERE direction = 'inbound' AND provider_message_id IS NOT NULL;
      CREATE INDEX email_messages_message_id ON public.email_messages (practice_id, provider_message_id);

      CREATE TABLE public.email_campaign_recipients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
        ${practice},
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
        email_address varchar(255) NOT NULL,
        fullname varchar(255),
        status public.enum_email_recipients_status NOT NULL DEFAULT 'pending',
        message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
        error_message text,
        sent_at timestamptz
      );
      CREATE UNIQUE INDEX email_campaign_recipients_address ON public.email_campaign_recipients (campaign_id, lower(email_address));
      CREATE INDEX email_campaign_recipients_status ON public.email_campaign_recipients (campaign_id, status);

      CREATE TABLE public.email_automation_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        trigger_type varchar(30) NOT NULL CHECK (trigger_type IN ('lead_created', 'stage_reached')),
        pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
        stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
        template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE RESTRICT,
        account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
        is_active boolean NOT NULL DEFAULT true,
        ${by("created_by")},
        ${by("updated_by")},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX email_automation_rules_trigger ON public.email_automation_rules (practice_id, trigger_type) WHERE is_active;

      CREATE TABLE public.email_automation_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id uuid NOT NULL REFERENCES public.email_automation_rules(id) ON DELETE CASCADE,
        ${practice},
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        event_key varchar(255) NOT NULL,
        status public.enum_email_runs_status NOT NULL,
        message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (rule_id, event_key)
      );
      CREATE INDEX email_automation_runs_practice ON public.email_automation_runs (practice_id, created_at DESC);
    `);
    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM public.role_permissions WHERE permission_key IN ('email.use', 'email.manage')`);
    for (const t of TABLES) await q(`DROP TABLE IF EXISTS public."${t}"`);
    for (const t of TYPES) await q(`DROP TYPE IF EXISTS public."${t}"`);
    // Back to the single-account table of 20261015000100 (empty).
    await q(`
      CREATE TABLE public.email_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        practice_id uuid NOT NULL UNIQUE REFERENCES public.practices(id) ON DELETE CASCADE,
        host varchar(255) NOT NULL, port int NOT NULL, secure boolean NOT NULL DEFAULT false,
        username varchar(255) NOT NULL, password_encrypted text NOT NULL, from_email varchar(255) NOT NULL,
        from_name varchar(120), reply_to varchar(255), is_active boolean NOT NULL DEFAULT true,
        last_tested_at timestamptz, last_error text, updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      )`);
  });
}
