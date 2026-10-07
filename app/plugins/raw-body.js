import fp from "fastify-plugin";
import rawBody from "fastify-raw-body";

// Exact request bytes for webhook signature checks. Opt-in per route with
// { config: { rawBody: true } }.
export default fp(async (app) => {
  await app.register(rawBody, { field: "rawBody", global: false, encoding: "utf8", runFirst: true });
});
