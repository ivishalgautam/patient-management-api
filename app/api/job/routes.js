"use strict";
import controller from "./controller.js";

export default async function routes(fastify) {
  fastify.get("/failed", {}, controller.listFailed);
  fastify.post("/:id/retry", {}, controller.retry);
}
