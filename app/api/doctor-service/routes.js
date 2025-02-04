"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.get("/", {}, controller.get);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/getByServiceId/:id", {}, controller.getByServiceId);
}
