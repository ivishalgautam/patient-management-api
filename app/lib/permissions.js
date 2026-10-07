"use strict";
import { QueryTypes } from "sequelize";
import { sequelize } from "../db/postgres.js";

// role -> permission keys, cached briefly. Saving a role's permissions
// calls invalidatePermissions() so changes apply within this process
// immediately (and within TTL elsewhere).
const TTL_MS = 60_000;
const cache = new Map();

export function invalidatePermissions() {
  cache.clear();
}

export async function getPermissions({ role_id: roleId, role }) {
  const cacheKey = roleId ?? `system:${role}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;

  const rows = await sequelize.query(
    roleId
      ? `SELECT rp.permission_key FROM role_permissions rp WHERE rp.role_id = :roleId`
      : `SELECT rp.permission_key FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
          WHERE r.practice_id IS NULL AND r.key = :role`,
    { replacements: { roleId, role }, type: QueryTypes.SELECT },
  );
  const keys = rows.map((r) => r.permission_key);
  cache.set(cacheKey, { keys, at: Date.now() });
  return keys;
}

export const can = (ctx, ...keys) =>
  !!ctx && (ctx.isPlatformAdmin || keys.some((k) => ctx.permissions?.includes(k)));

export default { getPermissions, invalidatePermissions, can };
