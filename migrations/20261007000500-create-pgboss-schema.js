"use strict";
// Job queue schema (pg-boss v10), created here so a fresh `migrate:up`
// yields everything the app needs. pg-boss then starts with migrate:false.
import PgBoss from "pg-boss";

export const SCHEMA = "pgboss";

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.query(PgBoss.getConstructionPlans(SCHEMA));
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
}
