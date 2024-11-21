"use strict";

import controller from "./controller.js";
import jwtVerify from "../../helpers/auth.js";
import { schema } from "./schema.js";

export default async function routes(fastify, options) {
  fastify.addHook("onRequest", jwtVerify.verifyToken);
  fastify.post(
    "/:id/change-password",
    { schema: schema.checkParam },
    controller.updatePassword
  );
  fastify.put("/:id", { schema: schema.checkParam }, controller.update);
  fastify.put(
    "/status/:id",
    { schema: schema.checkParam },
    controller.updateStatus
  );
  fastify.get("/me", {}, controller.getUser);
  fastify.post("/", { schema: schema.create }, controller.create);
  fastify.get("/", {}, controller.get);
  fastify.get("/:id", { schema: schema.checkParam }, controller.getById);
  fastify.delete("/:id", { schema: schema.checkParam }, controller.deleteById);
}
