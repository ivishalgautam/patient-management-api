"use strict";

import controller from "./controller.js";

export default async function routes(fastify, otps) {
  fastify.post("/", {}, controller.create);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/:id", {}, controller.getById);
}

export async function bannerPublicRoutes(fastify, opts) {
  fastify.get("/", {}, controller.get);
}
