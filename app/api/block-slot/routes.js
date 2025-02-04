"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.get("/getByClinicId/:id", {}, controller.getByClinicId);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/getByDateAndClinic", {}, controller.getByDateAndClinic);
}
