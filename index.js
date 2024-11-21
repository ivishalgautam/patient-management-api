import config from "./app/config/index.js";
import server from "./server.js";
import fastify from "fastify";

// const app = fastify({
//   logger: {
//     level: "debug",
//     transport: {
//       target: "@mgcrea/pino-pretty-compact",
//       options: {
//         translateTime: "HH:MM:ss Z",
//         ignore: "pid,hostname",
//       },
//     },
//   },
// });

const app = fastify({ logger: true });

try {
  server(app);
} catch (e) {
  console.log({ error: e });
  process.exit(1);
}

/**
 * Run the server!
 */
const start = async () => {
  try {
    await app.listen({ port: config.port }); // For fastify server
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
};

start();
