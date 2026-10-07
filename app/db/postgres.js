import config from "../config/index.js";
import { Sequelize } from "sequelize";
import migration from "./index.js";
import { createMigrator } from "./migrator.js";

export const sequelize = new Sequelize(
  config.pg_database_name,
  config.pg_username,
  config.pg_password,
  {
    host: config.pg_host,
    port: config.pg_port,
    // A saturated pool fails fast (10s) instead of hanging requests.
    pool: { max: config.pg_pool_max, min: 0, acquire: 10_000, idle: 10_000 },
    dialect: config.pg_dialect,
    logging: false,
  },
);

async function postgresConnection(fastify, options) {
  try {
    await sequelize.authenticate();
    fastify.log.info(`Postgres Database connection OK!`);
    // Models must be ready before the server accepts requests.
    await migration.init(sequelize);
    fastify.log.info(`Models initialized.`);

    // Schema changes are applied with `npm run migrate:up`, never at boot.
    const pending = await createMigrator(sequelize, { logger: undefined }).pending();
    if (pending.length) {
      fastify.log.warn(
        `${pending.length} pending migration(s): ${pending.map((m) => m.name).join(", ")}. Run \`npm run migrate:up\`.`,
      );
    }
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

export default postgresConnection;
