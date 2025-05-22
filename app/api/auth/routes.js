"use strict";
import controller from "./controller.js";
import userController from "../users/controller.js";

export default async function routes(fastify, options) {
  fastify.addHook("preHandler", async (request, reply) => {
    request.body && console.log("body", request.body);
  });
  fastify.addHook("onSend", async (request, reply, payload) => {
    console.log({ response: payload }, "Response payload");
  });
  fastify.post("/login", {}, controller.verifyUserCredentials);
  fastify.post("/register", {}, controller.createNewUser);
  fastify.post("/refresh", {}, controller.verifyRefreshToken);
  fastify.post("/username", {}, userController.checkUsername);
  fastify.post("/:token", {}, userController.resetPassword);
}
