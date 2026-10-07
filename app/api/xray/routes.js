"use strict";

import { multipartPreHandler } from "../../middlewares/multipart-prehandler.js";
import controller from "./controller.js";

export default async function routes(fastify, opt) {
  fastify.post(
    "/",
    { preHandler: (req, res) => multipartPreHandler(req, res, []) },
    controller.create,
  );
  fastify.put("/:id", {}, controller.updateById);
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/getByTreatmentId/:id", {}, controller.getByTreatmentId);
}
