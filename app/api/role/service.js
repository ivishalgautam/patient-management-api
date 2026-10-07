"use strict";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/app-error.js";
import { ASSIGNABLE_PERMISSIONS, PERMISSIONS, PERMISSION_GROUPS } from "../../lib/constants/permissions.js";
import { getPermissions, invalidatePermissions } from "../../lib/permissions.js";

// Roles: the built-in system roles (shared by every practice, read-only
// here) and the practice's own roles. A practice role extends "staff":
// its members are staff users whose permissions come from that role.
const CUSTOM_BASE = "staff";

const inGroup = (key, prefixes) => [].concat(prefixes).some((p) => key.startsWith(p));

export function permissionCatalogue() {
  return PERMISSION_GROUPS.map(([name, prefixes]) => ({
    name,
    permissions: Object.keys(PERMISSIONS)
      .filter((key) => inGroup(key, prefixes))
      .map((key) => ({ key, description: PERMISSIONS[key], assignable: ASSIGNABLE_PERMISSIONS.includes(key) })),
  })).filter((g) => g.permissions.length);
}

export async function listRoles(ctx) {
  const roles = await select(
    `SELECT r.id, r.key, r.name, r.is_system, r.base_role, r.practice_id,
            coalesce((SELECT array_agg(rp.permission_key ORDER BY rp.permission_key) FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS permissions,
            (SELECT count(*)::int FROM users u
              WHERE u.practice_id = :practiceId AND u.deleted_at IS NULL
                AND (u.role_id = r.id OR (u.role_id IS NULL AND r.is_system AND u.role::text = r.key))) AS member_count
       FROM roles r
      WHERE (r.practice_id IS NULL AND r.key IN ('doctor', 'staff')) OR r.practice_id = :practiceId
      ORDER BY r.is_system DESC, (r.key = 'doctor') DESC, lower(r.name)`,
    { practiceId: ctx.practiceId },
  );
  return roles.map(({ practice_id, ...r }) => ({ ...r, editable: !r.is_system }));
}

async function loadCustomRole(ctx, id, transaction) {
  const role = await one(`SELECT * FROM roles WHERE id = :id`, { id }, { transaction });
  if (!role || (role.practice_id && role.practice_id !== ctx.practiceId)) throw notFound("Role not found.");
  if (role.is_system) throw forbidden("Built-in roles can't be changed. Create a role of your own instead.");
  return role;
}

function cleanPermissions(keys) {
  const unknown = keys.filter((k) => !ASSIGNABLE_PERMISSIONS.includes(k));
  if (unknown.length) throw badRequest(`These permissions can't be given to a practice role: ${unknown.join(", ")}`);
  return [...new Set(keys)];
}

async function writePermissions(roleId, keys, transaction) {
  await exec(`DELETE FROM role_permissions WHERE role_id = :roleId`, { roleId }, { transaction });
  for (const key of keys) {
    await exec(`INSERT INTO role_permissions (role_id, permission_key) VALUES (:roleId, :key)`, { roleId, key }, { transaction });
  }
}

const slug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "role";

export async function createRole(ctx, { name, permissions, copy_from: copyFrom }) {
  let keys = permissions;
  if (!keys && copyFrom) {
    const source = await one(
      `SELECT id FROM roles WHERE id = :copyFrom AND (practice_id IS NULL OR practice_id = :practiceId)`,
      { copyFrom, practiceId: ctx.practiceId },
    );
    if (!source) throw badRequest("The role to copy doesn't exist.");
    keys = (await select(`SELECT permission_key FROM role_permissions WHERE role_id = :id`, { id: source.id }))
      .map((r) => r.permission_key)
      .filter((k) => ASSIGNABLE_PERMISSIONS.includes(k));
  }
  keys = cleanPermissions(keys ?? []);
  const id = await withTransaction(async (transaction) => {
    const taken = await one(
      `SELECT 1 FROM roles WHERE (practice_id = :practiceId OR practice_id IS NULL) AND lower(name) = lower(:name)`,
      { practiceId: ctx.practiceId, name },
      { transaction },
    );
    if (taken) throw conflict("A role with this name already exists.");
    const role = await one(
      `INSERT INTO roles (practice_id, key, name, is_system, base_role)
       VALUES (:practiceId, :key, :name, false, :base) RETURNING id`,
      { practiceId: ctx.practiceId, key: `${slug(name)}_${Date.now().toString(36)}`, name, base: CUSTOM_BASE },
      { transaction },
    );
    await writePermissions(role.id, keys, transaction);
    return role.id;
  });
  return (await listRoles(ctx)).find((r) => r.id === id);
}

export async function updateRole(ctx, id, { name, permissions }) {
  await withTransaction(async (transaction) => {
    const role = await loadCustomRole(ctx, id, transaction);
    if (name && name.toLowerCase() !== role.name.toLowerCase()) {
      const taken = await one(
        `SELECT 1 FROM roles WHERE (practice_id = :practiceId OR practice_id IS NULL) AND lower(name) = lower(:name) AND id <> :id`,
        { practiceId: ctx.practiceId, name, id },
        { transaction },
      );
      if (taken) throw conflict("A role with this name already exists.");
    }
    if (name) await exec(`UPDATE roles SET name = :name, updated_at = now() WHERE id = :id`, { id, name }, { transaction });
    if (permissions) await writePermissions(id, cleanPermissions(permissions), transaction);
  });
  invalidatePermissions();
  return (await listRoles(ctx)).find((r) => r.id === id);
}

export async function deleteRole(ctx, id) {
  await withTransaction(async (transaction) => {
    await loadCustomRole(ctx, id, transaction);
    const { n } = await one(`SELECT count(*)::int AS n FROM users WHERE role_id = :id AND deleted_at IS NULL`, { id }, { transaction });
    if (n) throw conflict(`${n} team member${n === 1 ? " uses" : "s use"} this role. Move them to another role first.`);
    // Deactivated/deleted users on this role fall back to their built-in role.
    await exec(`UPDATE users SET role_id = NULL WHERE role_id = :id`, { id }, { transaction });
    await exec(`DELETE FROM roles WHERE id = :id`, { id }, { transaction });
  });
  invalidatePermissions();
}

// Doctors and staff of the practice with the role they use.
export function listMembers(ctx) {
  return select(
    `SELECT u.id, u.fullname, u.username, u.role, u.is_active,
            coalesce(r.id, sr.id) AS role_id, coalesce(r.name, sr.name) AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN roles sr ON sr.practice_id IS NULL AND sr.key = u.role::text
      WHERE u.practice_id = :practiceId AND u.role IN ('doctor', 'staff') AND u.deleted_at IS NULL
      ORDER BY (u.role = 'doctor') DESC, lower(u.fullname)`,
    { practiceId: ctx.practiceId },
  );
}

// Staff only: either the built-in Staff role or one of the practice's roles.
export async function assignRole(ctx, userId, roleId) {
  const user = await one(
    `SELECT id, role FROM users WHERE id = :userId AND practice_id = :practiceId AND deleted_at IS NULL`,
    { userId, practiceId: ctx.practiceId },
  );
  if (!user) throw notFound("Team member not found.");
  if (user.role !== CUSTOM_BASE) throw badRequest("Only staff members can be given a different role.");
  const role = await one(
    `SELECT id, practice_id, is_system, key, base_role FROM roles
      WHERE id = :roleId AND (practice_id = :practiceId OR (practice_id IS NULL AND key = :base))`,
    { roleId, practiceId: ctx.practiceId, base: CUSTOM_BASE },
  );
  if (!role) throw badRequest("Choose the Staff role or one of your practice's roles.");
  await exec(`UPDATE users SET role_id = :roleId, updated_at = now() WHERE id = :userId`, { roleId: role.id, userId });
  return (await listMembers(ctx)).find((m) => m.id === userId);
}

// The caller's own role and permissions (lets the dashboard hide actions).
export async function myAccess(ctx, user) {
  const role = user.role_id ? await one(`SELECT name FROM roles WHERE id = :id`, { id: user.role_id }) : null;
  return {
    role: ctx.role,
    role_name: role?.name ?? null,
    is_platform_admin: ctx.isPlatformAdmin,
    permissions: ctx.isPlatformAdmin ? Object.keys(PERMISSIONS) : await getPermissions(user),
  };
}
