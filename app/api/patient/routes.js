"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.get("/", {}, controller.get);
}

export async function patientImportRoutes(fastify, opts) {
  fastify.post(
    "/import",
    {},
    controller.importPatients,
  );
}
