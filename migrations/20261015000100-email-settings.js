"use strict";
// Per-practice email (SMTP) settings, so a practice can send patient emails
// from its own mailbox without editing the server's .env. The password is
// AES-256-GCM encrypted (lib/integrations/secrets.js) and never returned.

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    CREATE TABLE public.email_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      practice_id uuid NOT NULL UNIQUE REFERENCES public.practices(id) ON DELETE CASCADE,
      host varchar(255) NOT NULL,
      port int NOT NULL CHECK (port BETWEEN 1 AND 65535),
      secure boolean NOT NULL DEFAULT false,
      username varchar(255) NOT NULL,
      password_encrypted text NOT NULL,
      from_email varchar(255) NOT NULL,
      from_name varchar(120),
      reply_to varchar(255),
      is_active boolean NOT NULL DEFAULT true,
      last_tested_at timestamptz,
      last_error text,
      updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS public.email_settings`);
}
