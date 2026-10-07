"use strict";
// Grants permissions added since the roles migration to the system roles
// (idempotent; custom practice roles are left to their owners).
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

export async function up({ context: queryInterface }) {
  await seedSystemRoles(queryInterface.sequelize);
}

// Permissions only ever get added here; nothing to undo safely.
export async function down() {}
