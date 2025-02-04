"use strict";

import controller from "./controller.js";

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
