import fp from "fastify-plugin";
import cors from "@fastify/cors";
import config from "../config/index.js";

export default fp(async (app) => {
  const origins = config.allowed_origins;
  if (!origins.length) {
    app.log.warn("ALLOWED_ORIGINS is empty: CORS allows every origin.");
  }
  await app.register(cors, {
    origin: origins.length ? origins : "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
});
