"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opt) {
  fastify.post("/", {}, controller.create);
  fastify.get("/", {}, controller.get);
  fastify.get("/:clinic_id/:patient_id", {}, controller.getByPatientId);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
}
