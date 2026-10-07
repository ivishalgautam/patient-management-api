import config from "../config/index.js";
import { Sequelize } from "sequelize";
import migration from "./index.js";

export const sequelize = new Sequelize(
  config.pg_database_name,
  config.pg_username,
  config.pg_password,
  {
    host: config.pg_host,
    port: config.pg_port,
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
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

export default postgresConnection;
