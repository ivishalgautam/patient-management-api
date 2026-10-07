import crypto from "crypto";
import fastify from "fastify";
import registerPlugins from "./app/plugins/index.js";
import { loggerOptions } from "./app/logger/index.js";

// Builds the API without listening. Used by index.js and by the tests.
export async function buildApp({ enableCron = false, logger = loggerOptions() } = {}) {
  const app = fastify({
    logger,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });
  await registerPlugins(app, { enableCron });
  return app;
}

export default buildApp;
