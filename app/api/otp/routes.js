"use strict";
import controller from "./controller.js";

export default async function routes(fastify, options) {
  fastify.post("/send", {}, controller.create);
  fastify.post("/verify/:otp", {}, controller.verify);
}
