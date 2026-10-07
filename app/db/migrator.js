"use strict";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Umzug, SequelizeStorage } from "umzug";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

export const BASELINE = "00000000000000-baseline.js";

// Umzug over migrations/*.js. Each migration exports up/down receiving
// { context: queryInterface }. Applied names live in "SequelizeMeta".
export function createMigrator(sequelize, { logger = console } = {}) {
  return new Umzug({
    migrations: {
      glob: ["*.js", { cwd: MIGRATIONS_DIR }],
      resolve: ({ name, path: filePath, context }) => ({
        name,
        up: async () => (await import(pathToFileURL(filePath))).up({ context }),
        down: async () => (await import(pathToFileURL(filePath))).down({ context }),
      }),
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger,
  });
}
