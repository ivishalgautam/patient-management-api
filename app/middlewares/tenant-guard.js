"use strict";
import { QueryTypes } from "sequelize";
import { sequelize } from "../db/postgres.js";
import { TENANT_MAP, RESOURCES } from "../lib/tenant-map.js";

const notFound = (reply) =>
  reply.code(404).send({ status: false, error: "Not Found", message: "Not found." });

const read = (req, source) => {
  const [where, key] = source.split(".");
  return req[where]?.[key];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownPatientId(req) {
  if (req.ctx.patientId === undefined) {
    const [row] = await sequelize.query(`SELECT id FROM patients WHERE user_id = :id`, {
      replacements: { id: req.ctx.userId },
      type: QueryTypes.SELECT,
    });
    req.ctx.patientId = row?.id ?? null;
  }
  return req.ctx.patientId;
}

export const routeKey = (method, url) => `${method} ${url}`;

// preHandler that enforces TENANT_MAP for the current route.
export async function tenantGuard(req, reply) {
  const rule = TENANT_MAP[routeKey(req.method, req.routeOptions.url)];
  const ctx = req.ctx;

  if (rule === undefined) {
    // Unmapped routes are refused rather than silently unscoped.
    req.log.error({ route: req.routeOptions.url }, "route missing from TENANT_MAP");
    return notFound(reply);
  }
  if (ctx.isPlatformAdmin) return;
  if (rule === "admin") {
    return reply.code(403).send({
      status: false,
      error: "Forbidden",
      message: "You don't have permission to perform this action.",
    });
  }
  if (!Array.isArray(rule)) return; // "list" | "global"

  for (const [resource, source] of rule) {
    const id = read(req, source);
    if (id === undefined || id === null || id === "") continue;
    if (!UUID.test(String(id))) return notFound(reply);

    const [row] = await sequelize.query(RESOURCES[resource], {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    // A missing row is left to the handler (it answers 404 itself).
    if (!row) continue;
    if (row.practice_id !== ctx.practiceId) return notFound(reply);

    if (ctx.role === "patient") {
      if (resource === "user" && row.user_id !== ctx.userId) return notFound(reply);
      if (row.patient_id && row.patient_id !== (await ownPatientId(req))) {
        return notFound(reply);
      }
    }
  }
}

export default tenantGuard;
