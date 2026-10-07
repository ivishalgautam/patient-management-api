"use strict";
// Default dental pipeline + custom fields for every existing practice, and
// the new leads permissions for the system roles. New practices get the
// defaults on first use (lib/leads/defaults.js#ensureLeadDefaults).
import { ensureLeadDefaults } from "../app/lib/leads/defaults.js";
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

export async function up({ context: queryInterface }) {
  const [practices] = await queryInterface.sequelize.query(`SELECT id FROM practices`);
  for (const { id } of practices) await ensureLeadDefaults(id);
  await seedSystemRoles(queryInterface.sequelize);
}

// Seeded rows are removed with the tables by the previous migration's down.
export async function down() {}
