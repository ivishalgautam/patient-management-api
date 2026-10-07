// Registration order matters: cross-cutting plugins first, routes last.
import pg_database from "../db/postgres.js";
import { ErrorHandler } from "../utils/error-handler.js";
import requestContext from "./request-context.js";
import rateLimit from "./rate-limit.js";
import security from "./security.js";
import cors from "./cors.js";
import cookie from "./cookie.js";
import staticFiles from "./static.js";
import multipart from "./multipart.js";
import scheduler from "./scheduler.js";
import queue from "./queue.js";
import healthRoutes from "./health.js";
import routes from "../routes/v1/index.js";
import publicRoutes from "../routes/v1/public.js";
import authRoutes from "../api/auth/routes.js";
import uploadFileRoutes from "../api/upload-file/routes.js";

export default async function registerPlugins(
  app,
  { enableCron = false, enableWorkers = enableCron } = {},
) {
  app.setErrorHandler(ErrorHandler);

  await app.register(requestContext);
  await app.register(rateLimit);
  await app.register(security);
  await app.register(cors);
  await app.register(cookie);
  await app.register(staticFiles);
  await app.register(multipart);
  await app.register(pg_database);
  await app.register(scheduler, { enableCron });
  await app.register(queue, { enableWorkers });

  await app.register(healthRoutes);
  await app.register(uploadFileRoutes, { prefix: "v1/upload" });
  await app.register(routes, { prefix: "v1" });
  await app.register(publicRoutes, { prefix: "v1" });
  await app.register(authRoutes, { prefix: "v1/auth" });
}
