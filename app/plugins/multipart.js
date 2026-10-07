import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import config from "../config/index.js";

export default fp(async (app) => {
  await app.register(multipart, {
    limits: { fileSize: config.max_upload_bytes },
  });
});
