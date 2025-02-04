"use strict";

import controller from "./controller.js";

export default async (fastify, options) => {
  fastify.get("/", {}, controller.get);
  fastify.delete("/", {}, controller._delete);
  fastify.post("/files", {}, controller.upload);
  //   fastify.post("/video", {}, controller.uploadVideo);
  //   fastify.delete("/video", {}, controller.deleteVideoFile);
};
