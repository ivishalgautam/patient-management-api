"use strict";
// Roles and action-level permissions. System roles (practice_id NULL) mirror
// the users.role enum; practices can add custom roles later. users.role is
// kept for compatibility, users.role_id points at the role in use.
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, transaction });

    await q(`
      CREATE TABLE public.roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,
        key varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX roles_practice_key ON public.roles (coalesce(practice_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
      CREATE TABLE public.role_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        permission_key varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX role_permissions_role_key ON public.role_permissions (role_id, permission_key);
      ALTER TABLE public.users ADD COLUMN role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;
      CREATE INDEX users_role_id ON public.users (role_id);
    `);

    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    ALTER TABLE public.users DROP COLUMN IF EXISTS role_id;
    DROP TABLE IF EXISTS public.role_permissions;
    DROP TABLE IF EXISTS public.roles;
  `);
}
