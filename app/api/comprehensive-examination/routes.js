"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/getByPatientId/:id", {}, controller.getByPatientId);
}
