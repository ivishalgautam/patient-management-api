"use strict";
import config from "../config/index.js";
import { PERMISSION_MAP } from "../lib/permission-map.js";
import { getPermissions } from "../lib/permissions.js";

const forbidden = (reply) =>
  reply.code(403).send({
    status: false,
    error: "Forbidden",
    message: "You don't have permission to perform this action.",
  });

// preHandler enforcing PERMISSION_MAP. Also loads req.ctx.permissions for
// handlers that make finer checks (lib/permissions.js#can).
export async function permissionGuard(req, reply) {
  const ctx = req.ctx;
  ctx.permissions = ctx.isPlatformAdmin ? [] : await getPermissions(req.user_data);

  const rule = PERMISSION_MAP[`${req.method} ${req.routeOptions.url}`];
  if (rule === undefined) {
    req.log.error({ route: req.routeOptions.url }, "route missing from PERMISSION_MAP");
    return forbidden(reply);
  }
  if (ctx.isPlatformAdmin || rule === "authenticated") return;
  if (rule.some((key) => ctx.permissions.includes(key))) return;

  if (!config.permissions_enforce) {
    req.log.warn({ route: req.routeOptions.url, role: ctx.role }, "permission denied (not enforced)");
    return;
  }
  return forbidden(reply);
}

export default permissionGuard;
