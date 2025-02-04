"use strict";

import { multipartPreHandler } from "../../lib/middlewares/multipart-prehandler.js";
import controller from "./controller.js";

export default async function routes(fastify, opt) {
  fastify.post("/", { preHandler: multipartPreHandler }, controller.create);
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/getByTreatmentId/:id", {}, controller.getByTreatmentId);
}
