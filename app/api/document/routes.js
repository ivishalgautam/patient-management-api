"use strict";

import { multipartPreHandler } from "../../lib/middlewares/multipart-prehandler.js";
import controller from "./controller.js";

export default async function routes(fastify, opt) {
  fastify.post(
    "/",
    { preHandler: (req, res) => multipartPreHandler(req, res, []) },
    controller.create
  );
  fastify.put(
    "/:id",
    { preHandler: (req, res) => multipartPreHandler(req, res, ["documents"]) },
    controller.updateById
  );
  fastify.get("/:id", {}, controller.getById);
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.get("/", {}, controller.get);
  fastify.get("/getByPatientId/:id", {}, controller.getByPatientId);
  fastify.get("/get-by-treatment-id/:id", {}, controller.getByTreatmentId);
}
