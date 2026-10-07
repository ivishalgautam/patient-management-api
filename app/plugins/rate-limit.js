import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import config from "../config/index.js";

export default fp(async (app) => {
  await app.register(rateLimit, {
    max: config.rate_limit.max,
    timeWindow: config.rate_limit.time_window,
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `You have exceeded the ${context.max} requests in ${context.after} time window.`,
    }),
  });
});
