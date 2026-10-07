import fp from "fastify-plugin";
import fastifyView from "@fastify/view";
import ejs from "ejs";

export default fp(async (app) => {
  await app.register(fastifyView, { engine: { ejs } });
});
