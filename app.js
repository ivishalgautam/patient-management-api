import crypto from "crypto";
import fastify from "fastify";
import registerPlugins from "./app/plugins/index.js";
import { loggerOptions } from "./app/logger/index.js";

// Builds the API without listening. Used by index.js and by the tests.
export async function buildApp({
  enableCron = false,
  logger = loggerOptions(),
  enableWorkers = enableCron,
  onRoute,
} = {}) {
  const app = fastify({
    logger,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });
  if (onRoute) app.addHook("onRoute", onRoute);
  await registerPlugins(app, { enableCron, enableWorkers });
  return app;
}

export default buildApp;
