"use strict";

import controller from "./controller.js";
import { requireRole } from "../../lib/middlewares/require-role.js";

export default async function routes(fastify, opt) {
  fastify.post("/", {}, controller.create);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/:slug", {}, controller.getBySlug);
  fastify.get("/getById/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
}

export async function servicePublicRoutes(fastify, opts) {
  fastify.get("/", {}, controller.get);
  fastify.get("/getByProcedureId/:id", {}, controller.getByProcedureId);
}

export async function serviceImportRoutes(fastify, opts) {
  fastify.post(
    "/import",
    { preHandler: requireRole("admin", "doctor") },
    controller.importServices,
  );
}
