"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/", {}, controller.get);
}
