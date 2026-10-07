// node modules
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import fs from "fs";
// fastify modules
import cors from "@fastify/cors";
import fastifyView from "@fastify/view";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyCron from "fastify-cron";
import { ToadScheduler } from "toad-scheduler";

// import internal modules
import authRoutes from "./app/api/auth/routes.js";
import pg_database from "./app/db/postgres.js";
import routes from "./app/routes/v1/index.js";
import uploadFileRoutes from "./app/api/upload_files/routes.js";
import { ErrorHandler } from "./app/helpers/error-handler.js";

// other modules
import ejs from "ejs";
import publcRoutes from "./app/routes/v1/public.js";
import { scheduleAppointmentCron } from "./app/scheduler/appointment-cron.js";

/*
  Register External packages, routes, database connection
*/
export default (app, { enableCron = true } = {}) => {
  app.setErrorHandler(ErrorHandler);
  const scheduler = new ToadScheduler();

  if (enableCron) scheduleAppointmentCron(scheduler);

  app.addHook("onClose", async () => {
    scheduler.stop();
    console.log("🛑 Appointment scheduler stopped");
  });

  app.register(fastifyRateLimit, {
    max: Number(process.env.MAX_RATE_LIMIT), // Max requests per minute
    timeWindow: process.env.TIME_WINDOW,
    errorResponseBuilder: (req, context) => {
      throw {
        statusCode: 429,
        error: "Too Many Requests",
        message: `You have exceeded the ${context.max} requests in ${context.after} time window.`,
      };
    },
  });
  app.register(fastifyHelmet);
  // Only the uploads folder is public. Stored file paths look like
  // "public/images/<file>", so it is served under the /public/ prefix.
  const publicDir = path.join(dirname(fileURLToPath(import.meta.url)), "public");
  fs.mkdirSync(publicDir, { recursive: true });
  app.register(fastifyStatic, { root: publicDir, prefix: "/public/" });

  app.register(cors, { origin: "*" });
  app.register(pg_database);
  app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // Set the limit to 5 GB or adjust as needed
  });
  app.register(fastifyView, {
    engine: { ejs: ejs },
  });
  app.register(uploadFileRoutes, { prefix: "v1/upload" });
  // Increase the payload size limit
  app.register(routes, { prefix: "v1" });
  app.register(publcRoutes, { prefix: "v1" });
  app.register(authRoutes, { prefix: "v1/auth" });
};
