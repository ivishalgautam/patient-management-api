import { buildApp } from "../../app.js";

export async function buildTestApp() {
  const app = await buildApp({ enableCron: false, logger: false });
  await app.ready();
  return app;
}
