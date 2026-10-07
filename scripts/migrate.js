// Usage:
//   node scripts/migrate.js up [name]      apply pending (optionally up to name)
//   node scripts/migrate.js down [name]    revert last, or every migration after AND
//                                          including name ("0" = all)
//   node scripts/migrate.js status
//   node scripts/migrate.js baseline       mark the baseline as applied on an
//                                          existing database (no DDL runs)
import { sequelize } from "../app/db/postgres.js";
import { createMigrator, BASELINE } from "../app/db/migrator.js";

const [command = "status", target] = process.argv.slice(2);
const migrator = createMigrator(sequelize);

async function markBaseline() {
  const [rows] = await sequelize.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users', 'treatments', 'bookings')`,
  );
  if (rows[0].n !== 3) {
    throw new Error(
      "This database does not look like an existing dental DB (users/treatments/bookings missing). " +
        "For a fresh database run `npm run migrate:up` instead.",
    );
  }
  const executed = (await migrator.executed()).map((m) => m.name);
  if (executed.includes(BASELINE)) {
    console.log("Baseline already marked as applied.");
    return;
  }
  await migrator.storage.logMigration({ name: BASELINE });
  console.log(`Marked ${BASELINE} as applied.`);
}

async function run() {
  await sequelize.authenticate();
  switch (command) {
    case "up":
      await migrator.up(target ? { to: target } : undefined);
      break;
    case "down":
      if (process.env.NODE_ENV === "production") {
        throw new Error("Down migrations are blocked in production.");
      }
      await migrator.down(target ? { to: target === "0" ? 0 : target } : undefined);
      break;
    case "baseline":
      await markBaseline();
      break;
    case "status": {
      const executed = await migrator.executed();
      const pending = await migrator.pending();
      console.log("Executed:");
      executed.forEach((m) => console.log(`  ✔ ${m.name}`));
      console.log("Pending:");
      pending.forEach((m) => console.log(`  • ${m.name}`));
      if (!pending.length) console.log("  (none)");
      break;
    }
    default:
      throw new Error(`Unknown command "${command}"`);
  }
}

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error("Migration failed:", err.message);
    await sequelize.close();
    process.exit(1);
  });
