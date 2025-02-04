"use strict";

import controller from "./controller.js";

export default async function roues(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.get("/", {}, controller.get);
  fastify.get("/getByClinicId/:id", {}, controller.getByClinicId);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/getByDateAndClinic", {}, controller.getByDateAndClinic);
  fastify.put("/status/:id", {}, controller.updateStatus);
}
