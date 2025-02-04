"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/getByTreatmentId/:id", {}, controller.getByTreatmentId);
  fastify.get("/getByPatientId/:id", {}, controller.getByPatientId);
  fastify.get("/getRemainingPayment/:id", {}, controller.getRemainingPayment);
  fastify.get("/accounts/:id", {}, controller.accounts);
}
