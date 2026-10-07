import { sequelize } from "../db/postgres.js";

export default async function healthRoutes(app) {
  app.get("/health", { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await sequelize.query("SELECT 1");
      return { status: true, data: { db: "ok" } };
    } catch {
      return reply.code(503).send({ status: false, data: { db: "down" } });
    }
  });
}
