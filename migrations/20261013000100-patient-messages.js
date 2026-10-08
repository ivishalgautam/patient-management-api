"use strict";
// Patient messages (Dentee-style communications): automatic recall and
// birthday messages and bulk broadcasts to patients, by WhatsApp (the
// practice's Cloud API number and approved templates) and email (SMTP).
// patient_messages is both the send queue and the log; dedupe_key stops a
// patient getting the same automatic message twice.
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

const TABLES = ["patient_messages", "patient_broadcasts", "patient_message_rules"];
const TYPES = ["enum_patient_message_kind", "enum_patient_message_channel", "enum_patient_message_status", "enum_patient_broadcasts_status"];

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const practice = `practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE`;
    const content = `
        whatsapp_template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
        variable_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
        email_subject varchar(255),
        email_body text`;
    await q(`
      CREATE TYPE public.enum_patient_message_kind AS ENUM ('recall', 'birthday', 'broadcast');
      CREATE TYPE public.enum_patient_message_channel AS ENUM ('whatsapp', 'email');
      CREATE TYPE public.enum_patient_message_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
      CREATE TYPE public.enum_patient_broadcasts_status AS ENUM ('draft', 'sending', 'completed');

      CREATE TABLE public.patient_message_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        kind public.enum_patient_message_kind NOT NULL CHECK (kind <> 'broadcast'),
        is_active boolean NOT NULL DEFAULT false,
        recall_months int NOT NULL DEFAULT 6 CHECK (recall_months BETWEEN 1 AND 36),
        ${content},
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (practice_id, kind)
      );

      CREATE TABLE public.patient_broadcasts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        audience jsonb NOT NULL DEFAULT '{}'::jsonb,
        ${content},
        status public.enum_patient_broadcasts_status NOT NULL DEFAULT 'draft',
        created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX patient_broadcasts_practice ON public.patient_broadcasts (practice_id, created_at DESC);

      CREATE TABLE public.patient_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
        kind public.enum_patient_message_kind NOT NULL,
        broadcast_id uuid REFERENCES public.patient_broadcasts(id) ON DELETE CASCADE,
        channel public.enum_patient_message_channel NOT NULL,
        to_address varchar(255) NOT NULL,
        status public.enum_patient_message_status NOT NULL DEFAULT 'pending',
        error text,
        dedupe_key varchar(255),
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (practice_id, dedupe_key)
      );
      CREATE INDEX patient_messages_pending ON public.patient_messages (created_at) WHERE status = 'pending';
      CREATE INDEX patient_messages_practice ON public.patient_messages (practice_id, created_at DESC);
      CREATE INDEX patient_messages_broadcast ON public.patient_messages (broadcast_id, status);
    `);
    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM public.role_permissions WHERE permission_key = 'patient_messages.manage'`);
    for (const t of TABLES) await q(`DROP TABLE IF EXISTS public."${t}"`);
    for (const t of TYPES) await q(`DROP TYPE IF EXISTS public."${t}"`);
  });
}
