"use strict";

import controller from "./controller.js";
import { requireRole } from "../../lib/middlewares/require-role.js";

export default async function routes(fastify, opts) {
  fastify.get("/", {}, controller.get);
}

export async function patientImportRoutes(fastify, opts) {
  fastify.post(
    "/import",
    { preHandler: requireRole("admin", "doctor") },
    controller.importPatients,
  );
}
