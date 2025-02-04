"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opt) {
  fastify.post("/", {}, controller.create);
  fastify.get("/getByClinicId/:id", {}, controller.getMyPatientsByClinicId);
  fastify.delete("/:id", {}, controller.deleteById);
}
