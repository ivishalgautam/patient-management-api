"use strict";
import controller from "./controller.js";
import userController from "../users/controller.js";

export default async function routes(fastify, options) {
  fastify.post("/login", {}, controller.verifyUserCredentials);
  fastify.post("/register", {}, controller.createNewUser);
  fastify.post("/refresh", {}, controller.verifyRefreshToken);
  fastify.post("/username", {}, userController.checkUsername);
  fastify.post("/:token", {}, userController.resetPassword);
}
