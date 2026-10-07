import fastify from "fastify";
import server from "../../server.js";

export async function buildTestApp() {
  const app = fastify({ logger: false });
  server(app, { enableCron: false });
  await app.ready();
  return app;
}
