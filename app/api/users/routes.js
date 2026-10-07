"use strict";

import controller from "./controller.js";

export default async function routes(fastify, options) {
  fastify.post("/", {}, controller.create);
  fastify.post("/:id/change-password", {}, controller.updatePassword);
  fastify.put("/:id", {}, controller.update);
  fastify.put(
    "/status/:id",
    {},
    controller.updateStatus,
  );
  fastify.get("/me", {}, controller.getUser);
  fastify.get("/", {}, controller.get);
  fastify.get("/:id", {}, controller.getById);
  fastify.get("/:id/patient-details", {}, controller.getPatientById);
  fastify.get("/patients", {}, controller.getMyPatients);

  fastify.delete(
    "/:id",
    {},
    controller.deleteById,
  );
}
