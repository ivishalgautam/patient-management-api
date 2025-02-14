"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/getByPatientId", {}, controller.getByPatientId);
  fastify.get("/:id", {}, controller.getById);
  fastify.get("/getByClinicId/:id", {}, controller.getByClinicId);
  fastify.get(
    "/getByPatientAndClinicId/:patient_id/:clinic_id",
    {},
    controller.getByPatientAndClinicId
  );
  fastify.get(
    "/getPatientDetailsByPatientAndClinicId/:patient_id/:clinic_id",
    {},
    controller.getPatientDetailsByPatientAndClinicId
  );
  fastify.delete("/:id", {}, controller.deleteById);
}
