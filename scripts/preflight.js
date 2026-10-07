// Usage: npm run preflight   (uses the same .env / PG_* settings as the server)
// Read-only checks before deploying to a database; exits 1 on any FAIL.
import fs from "fs";
import { QueryTypes } from "sequelize";
import config from "../app/config/index.js";
import { sequelize } from "../app/db/postgres.js";
import { checkConfig, checkDatabase, hasFailures } from "../app/lib/preflight.js";

const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const migrations = fs
  .readdirSync(new URL("../migrations/", import.meta.url))
  .filter((f) => f.endsWith(".js"))
  .sort();

async function run() {
  await sequelize.authenticate();
  console.log(`Database: ${config.pg_database_name} on ${config.pg_host}:${config.pg_port}\n`);
  const results = [...checkConfig(config), ...(await checkDatabase(q, { migrations }))];
  for (const r of results) console.log(`${r.level.padEnd(4)}  ${r.check}: ${r.message}`);
  const failed = hasFailures(results);
  console.log(`\n${failed ? "Not ready: fix the FAIL lines first." : "No blocking problems found."}`);
  return failed;
}

run()
  .then(async (failed) => {
    await sequelize.close();
    process.exit(failed ? 1 : 0);
  })
  .catch(async (error) => {
    console.error(error.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
