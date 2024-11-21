"use strict";

import controller from "./controller.js";

export default async function roues(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.get("/", {}, controller.get);
}
