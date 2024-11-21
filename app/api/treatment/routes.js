"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
}
