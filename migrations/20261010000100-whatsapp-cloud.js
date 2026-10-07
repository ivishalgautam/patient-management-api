"use strict";
// WhatsApp Cloud API module (revamp M037, modelled on BW Task's WhatsApp
// module): the practice's WhatsApp Business account, message templates,
// a two-way conversation inbox, broadcast campaigns, and the pipeline
// lost-reason list used by the leads UI.
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

const TABLES = [
  "whatsapp_campaign_recipients",
  "whatsapp_campaigns",
  "whatsapp_messages",
  "whatsapp_conversations",
  "whatsapp_templates",
  "whatsapp_accounts",
];
const TYPES = [
  "enum_whatsapp_templates_category",
  "enum_whatsapp_templates_status",
  "enum_whatsapp_messages_direction",
  "enum_whatsapp_messages_status",
  "enum_whatsapp_campaigns_status",
  "enum_whatsapp_campaign_recipients_status",
];

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const practice = `practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE`;
    await q(`
      CREATE TYPE public.enum_whatsapp_templates_category AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');
      CREATE TYPE public.enum_whatsapp_templates_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');
      CREATE TYPE public.enum_whatsapp_messages_direction AS ENUM ('in', 'out');
      CREATE TYPE public.enum_whatsapp_messages_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
      CREATE TYPE public.enum_whatsapp_campaigns_status AS ENUM ('DRAFT', 'SENDING', 'COMPLETED', 'FAILED');
      CREATE TYPE public.enum_whatsapp_campaign_recipients_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'replied', 'failed');

      -- One WhatsApp Business number per practice. The access token is
      -- AES-256-GCM encrypted and never returned by the API.
      CREATE TABLE public.whatsapp_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice} UNIQUE,
        phone_number_id varchar(64) NOT NULL UNIQUE,
        waba_id varchar(64) NOT NULL,
        display_phone_number varchar(32),
        verified_name varchar(255),
        access_token_encrypted text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        create_leads_from_inbound boolean NOT NULL DEFAULT true,
        default_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
        default_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
        last_error text,
        last_webhook_at timestamptz,
        created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.whatsapp_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        meta_template_id varchar(64),
        name varchar(512) NOT NULL,
        category public.enum_whatsapp_templates_category NOT NULL,
        language varchar(16) NOT NULL DEFAULT 'en_US',
        parameter_format varchar(16) NOT NULL DEFAULT 'positional',
        status public.enum_whatsapp_templates_status NOT NULL DEFAULT 'PENDING',
        rejection_reason text,
        components jsonb NOT NULL DEFAULT '[]'::jsonb,
        deleted_at timestamptz,
        created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX whatsapp_templates_name ON public.whatsapp_templates (practice_id, name, language);
      CREATE INDEX whatsapp_templates_meta ON public.whatsapp_templates (meta_template_id);

      -- One thread per phone number per practice; linked to the lead with
      -- that number (created from inbound messages when enabled).
      CREATE TABLE public.whatsapp_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        phone varchar(20) NOT NULL,
        contact_name varchar(255),
        last_customer_message_at timestamptz,
        last_message_at timestamptz,
        last_message_preview text,
        unread_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX whatsapp_conversations_phone ON public.whatsapp_conversations (practice_id, phone);
      CREATE INDEX whatsapp_conversations_recent ON public.whatsapp_conversations (practice_id, last_message_at DESC NULLS LAST);
      CREATE INDEX whatsapp_conversations_lead ON public.whatsapp_conversations (lead_id);

      CREATE TABLE public.whatsapp_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
        wamid varchar(255) UNIQUE,
        direction public.enum_whatsapp_messages_direction NOT NULL,
        type varchar(32) NOT NULL DEFAULT 'text',
        body text,
        status public.enum_whatsapp_messages_status NOT NULL DEFAULT 'queued',
        error_message text,
        template_name varchar(512),
        media_id varchar(255),
        media_type varchar(128),
        media_filename varchar(255),
        sent_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX whatsapp_messages_thread ON public.whatsapp_messages (conversation_id, created_at);

      CREATE TABLE public.whatsapp_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        template_id uuid NOT NULL REFERENCES public.whatsapp_templates(id) ON DELETE RESTRICT,
        status public.enum_whatsapp_campaigns_status NOT NULL DEFAULT 'DRAFT',
        audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
        variable_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_recipients int NOT NULL DEFAULT 0,
        sent_count int NOT NULL DEFAULT 0,
        delivered_count int NOT NULL DEFAULT 0,
        read_count int NOT NULL DEFAULT 0,
        replied_count int NOT NULL DEFAULT 0,
        failed_count int NOT NULL DEFAULT 0,
        created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX whatsapp_campaigns_practice ON public.whatsapp_campaigns (practice_id, created_at DESC);

      CREATE TABLE public.whatsapp_campaign_recipients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
        ${practice},
        lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
        phone varchar(20) NOT NULL,
        name varchar(255),
        status public.enum_whatsapp_campaign_recipients_status NOT NULL DEFAULT 'pending',
        wamid varchar(255),
        error_message text,
        error_code int,
        sent_at timestamptz,
        delivered_at timestamptz,
        read_at timestamptz,
        replied_at timestamptz,
        UNIQUE (campaign_id, phone)
      );
      CREATE INDEX whatsapp_campaign_recipients_status ON public.whatsapp_campaign_recipients (campaign_id, status);
      CREATE INDEX whatsapp_campaign_recipients_wamid ON public.whatsapp_campaign_recipients (wamid);
      CREATE INDEX whatsapp_campaign_recipients_phone ON public.whatsapp_campaign_recipients (practice_id, phone, sent_at DESC);

      -- Reasons offered when a lead is marked lost (BW pipeline exit reasons).
      ALTER TABLE public.pipelines ADD COLUMN lost_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
      UPDATE public.pipelines SET lost_reasons =
        '["Not interested","Too expensive","Chose another clinic","Not reachable","Postponed treatment","Wrong number / false enquiry","Duplicate"]'::jsonb;
    `);
    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM public.role_permissions WHERE permission_key IN ('whatsapp.use', 'whatsapp.manage')`);
    await q(`ALTER TABLE public.pipelines DROP COLUMN IF EXISTS lost_reasons`);
    for (const t of TABLES) await q(`DROP TABLE IF EXISTS public."${t}"`);
    for (const t of TYPES) await q(`DROP TYPE IF EXISTS public."${t}"`);
  });
}
