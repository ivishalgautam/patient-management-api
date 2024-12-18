"use strict";

import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.get("/:id", {}, controller.getById);
}
