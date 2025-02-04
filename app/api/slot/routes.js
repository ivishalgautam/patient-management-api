"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.get("/", {}, controller.get);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/getByClinicId/:id", {}, controller.getByClinicId);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
}
