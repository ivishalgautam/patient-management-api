"use strict";
// Practice-editable roles, lead follow-up reminders and clinic-scoped lead
// visibility (revamp M035):
// * roles.base_role: which built-in role a custom role extends (custom
//   roles extend "staff"); users keep users.role, role_id picks the role.
// * user_notifications: in-app notifications (follow-up reminders).
// * lead_activities.reminded_at: a follow-up's reminder was sent.
// * grants the new leads.view_all_clinics permission to the system roles.
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.sequelize.query(
      `
      ALTER TABLE public.roles ADD COLUMN base_role varchar(20);
      UPDATE public.roles SET base_role = key WHERE is_system;

      ALTER TABLE public.lead_activities ADD COLUMN reminded_at timestamptz;
      CREATE INDEX lead_activities_reminders ON public.lead_activities (due_at)
        WHERE type = 'follow_up' AND completed_at IS NULL AND reminded_at IS NULL;

      CREATE TABLE public.user_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        type varchar(40) NOT NULL,
        title varchar(255) NOT NULL,
        body text,
        link varchar(255),
        lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX user_notifications_inbox ON public.user_notifications (user_id, created_at DESC);
      CREATE INDEX user_notifications_unread ON public.user_notifications (user_id) WHERE read_at IS NULL;
      `,
      { transaction },
    );
    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM public.role_permissions WHERE permission_key = 'leads.view_all_clinics'`);
    // Users on a custom role fall back to their built-in role.
    await q(`UPDATE public.users SET role_id = NULL
              WHERE role_id IN (SELECT id FROM public.roles WHERE NOT is_system)`);
    await q(`DELETE FROM public.roles WHERE NOT is_system`);
    await q(`
      DROP TABLE IF EXISTS public.user_notifications;
      DROP INDEX IF EXISTS public.lead_activities_reminders;
      ALTER TABLE public.lead_activities DROP COLUMN IF EXISTS reminded_at;
      ALTER TABLE public.roles DROP COLUMN IF EXISTS base_role;
    `);
    // System roles are re-linked by role name when role_id is empty.
    await q(`UPDATE public.users u SET role_id = r.id FROM public.roles r
              WHERE u.role_id IS NULL AND r.practice_id IS NULL AND r.key = u.role::text`);
  });
}
