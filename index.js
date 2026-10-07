import config from "./app/config/index.js";
import { buildApp } from "./app.js";

const start = async () => {
  const app = await buildApp({ enableCron: true });
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
  }
};

start().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
