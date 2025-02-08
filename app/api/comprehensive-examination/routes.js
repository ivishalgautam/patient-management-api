"use strict";

import { multipartPreHandler } from "../../lib/middlewares/multipart-prehandler.js";
import controller from "./controller.js";

export default async function routes(fastify, opts) {
  fastify.post("/", {}, controller.create);
  fastify.post(
    "/multiPart",
    {
      preHandler: (req, res) =>
        multipartPreHandler(req, res, ["affected_tooths"]),
    },
    controller.createMultipart
  );
  fastify.delete("/:id", {}, controller.deleteById);
  fastify.put("/:id", {}, controller.update);
  fastify.put(
    "/multiPart/:id",
    {
      preHandler: (req, res) =>
        multipartPreHandler(req, res, ["affected_tooths", "gallery"]),
    },
    controller.updateMultipart
  );
  fastify.get("/getByPatientId/:id", {}, controller.getByPatientId);
}
