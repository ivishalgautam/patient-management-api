// node modules
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { exec } from "child_process";
// fastify modules
import cors from "@fastify/cors";
import fastifyView from "@fastify/view";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyCron from "fastify-cron";

// import internal modules
import authRoutes from "./app/api/auth/routes.js";
import pg_database from "./app/db/postgres.js";
import routes from "./app/routes/v1/index.js";
import uploadFileRoutes from "./app/api/upload_files/routes.js";
import { ErrorHandler } from "./app/helpers/error-handler.js";

// other modules
import ejs from "ejs";
import publcRoutes from "./app/routes/v1/public.js";
import config from "./app/config/index.js";

/*
  Register External packages, routes, database connection
*/
export default (app) => {
  app.setErrorHandler(ErrorHandler);
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
  app.register(fastifyStatic, {
    root: path.join(dirname(fileURLToPath(import.meta.url), "public")),
  });

  app.register(cors, { origin: "*" });
  app.register(pg_database);
  app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // Set the limit to 5 GB or adjust as needed
  });
  app.register(fastifyView, {
    engine: {
      ejs: ejs,
    },
  });

  app.register(uploadFileRoutes, { prefix: "v1/upload" });
  // Increase the payload size limit
  app.register(routes, { prefix: "v1" });
  app.register(publcRoutes, { prefix: "v1" });
  app.register(authRoutes, { prefix: "v1/auth" });

  app.get("/v1/generate-backup", async (req, res) => {
    try {
      // Get current file and directory paths
      const currentFilePath = fileURLToPath(import.meta.url);
      const currentDirPath = dirname(currentFilePath);
      // Define a valid output file path
      const outputPath = path.join(currentDirPath, "../server/backup.sql");

      const generateBackup = (outputPath) => {
        return new Promise((resolve, reject) => {
          // Construct pg_dump command with correct flags
          const command = `pg_dump -U ${config.pg_username} -h localhost -p ${config.pg_port} -d ${config.pg_database_name} -f "${outputPath}"`;

          exec(
            command,
            { env: { PGPASSWORD: config.pg_password } }, // Pass password securely
            (error, stdout, stderr) => {
              if (error) {
                reject(`Error: ${stderr || error.message}`);
              } else {
                resolve(outputPath);
              }
            }
          );
        });
      };

      // Generate the backup
      await generateBackup(outputPath);

      res.send({ message: "Backup generated successfully", path: outputPath });
    } catch (error) {
      res.status(500).send({ error });
    }
  });
};
