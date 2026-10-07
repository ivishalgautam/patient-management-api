"use strict";

import controller from "./controller.js";
import jwtVerify from "../../helpers/auth.js";

export default async (fastify, options) => {
  fastify.get("/", {}, controller.get);
  fastify.delete("/", { onRequest: jwtVerify.verifyToken }, controller._delete);
  fastify.post("/files", { onRequest: jwtVerify.verifyToken }, controller.upload);
};
