"use strict";
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from "./constants/permissions.js";

// Creates the system roles with their default permissions (idempotent) and
// links users whose role_id is empty. Used by the roles migration and tests.
export async function seedSystemRoles(sequelize, { transaction } = {}) {
  const q = (sql, replacements) => sequelize.query(sql, { replacements, transaction });
  for (const [key, name] of Object.entries(SYSTEM_ROLES)) {
    let [[role]] = await q(`SELECT id FROM roles WHERE practice_id IS NULL AND key = :key`, { key });
    if (!role) {
      [[role]] = await q(
        `INSERT INTO roles (key, name, is_system) VALUES (:key, :name, true) RETURNING id`,
        { key, name },
      );
    }
    for (const permission of SYSTEM_ROLE_PERMISSIONS[key]) {
      await q(
        `INSERT INTO role_permissions (role_id, permission_key) VALUES (:role, :permission)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        { role: role.id, permission },
      );
    }
    await q(`UPDATE users SET role_id = :role WHERE role_id IS NULL AND role::text = :key`, {
      role: role.id,
      key,
    });
  }
  // roles.base_role exists from migration 20261009000100 on.
  const [[hasBase]] = await q(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'base_role'`,
  );
  if (hasBase) await q(`UPDATE roles SET base_role = key WHERE is_system AND base_role IS NULL`);
}

export default seedSystemRoles;
