# Dr. Dipti — Dental Practice API

Fastify + Sequelize + PostgreSQL API behind the clinic dashboard (`../client/dashboard`) and the patient-facing site.

## Setup

```bash
cp .env.example .env   # fill in DB credentials and secrets
npm install
npm run migrate:up     # fresh database: creates the schema
npm run dev            # http://localhost:3001
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start |
| `npm test` | Run the test suite against `TEST_PG_DATABASE` (dropped and recreated each run) |
| `npm run lint` | ESLint |
| `npm run migrate:up` / `migrate:down [name\|0]` / `migrate:status` | Umzug migrations in `migrations/` (down is blocked in production) |
| `npm run migrate:baseline` | **Existing databases only, once:** mark the baseline migration as applied without running it |
| `npm run format` | Prettier |

## Database migrations

The schema is managed by migrations only; the server never alters tables at boot and logs a warning when migrations are pending.

* **Existing database (production, staging, local copies):** back it up, run `npm run migrate:baseline` once, then `npm run migrate:up`.
* **Fresh database:** `npm run migrate:up`.

The baseline (`migrations/00000000000000-baseline.js` + `migrations/sql/`) is the pre-revamp schema taken from a production copy. The legacy `dental_notes` table is intentionally not part of it.

Revamp docs live in [`docs/revamp`](docs/revamp).
