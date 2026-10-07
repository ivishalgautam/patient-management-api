# Dr. Dipti — Dental Practice API

Fastify + Sequelize + PostgreSQL API behind the clinic dashboard (`../client/dashboard`) and the patient-facing site. Covers patients, appointments, treatments, billing, WhatsApp reminders and the **Leads module** (pipelines, forms, Facebook Lead Ads, Google add-on) — see [`docs/leads-module.md`](docs/leads-module.md).

## Requirements

* Node.js 20+
* PostgreSQL 13+ (the migrations create the `pg_trgm` extension, used for lead name search)

## Setup

```bash
cp .env.example .env   # fill in DB credentials and secrets (see below)
npm install
npm run migrate:up     # fresh database: creates the schema + default lead pipeline
npm run dev            # http://localhost:3001
```

Minimum `.env` for local development: `PG_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Add `INTEGRATION_ENCRYPTION_KEY` (`openssl rand -base64 32`) to use lead integrations. Every variable is documented in [`.env.example`](.env.example); the server validates them at boot and exits with a clear message when one is invalid.

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

The baseline (`migrations/00000000000000-baseline.js` + `migrations/sql/`) is the pre-revamp schema taken from a production copy. The legacy `dental_notes` table is intentionally not part of it. Every later migration has a working `down`; `migrate:down <name>` rolls back down to **and including** that migration, so never target the baseline on a real database.

## Project layout

```
app/
  api/<module>/        routes.js, controller.js or service.js per resource
  config/              env validation (zod) -> config object
  db/                  Sequelize connection, migrator, SQL helpers, transactions
  jobs/                pg-boss queue + job handlers
  lib/                 errors, tenancy and permission maps, leads + integrations logic
  middlewares/         tenant guard, permission guard, multipart
  plugins/             security headers, CORS, cookies, rate limit, static files, queue, health
  routes/v1/           route registration (authenticated and public)
  services/            WhatsApp (Wafly), appointment reminders
  validation-schema/   zod request schemas
migrations/            Umzug migrations (+ sql/ for the baseline)
scripts/migrate.js     migration CLI
test/                  Vitest: characterization, platform and leads suites
docs/                  revamp docs and the Leads module guide
```

## How requests are handled

* **Auth:** JWT access token + refresh token (`ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`), accepted as a Bearer header or the dashboard's httpOnly session cookie. Changing a password, deactivating or deleting a user revokes their existing tokens.
* **Tenancy:** every authenticated route is listed in `app/lib/tenant-map.js`; ids in params/body must belong to the caller's practice (404 otherwise). Unlisted routes are refused.
* **Permissions:** `app/lib/permission-map.js` maps each route to the permissions that allow it; roles hold permissions (`roles`, `role_permissions`). Built-in roles come from `app/lib/constants/permissions.js`; practices add their own roles in the dashboard. Tests fail if a route is missing from either map.
* **Errors:** services throw `AppError`; one handler answers `{ status: false, error, message }`. 500s never include internals, only a `request_id` that matches the logs.
* **Logging:** pino with request ids; auth headers, cookies, passwords and tokens are redacted and request bodies are never logged.

## Background jobs

Jobs run on [pg-boss](https://github.com/timgit/pg-boss) in the `pgboss` schema of the same database (no extra infrastructure). Queues: WhatsApp messages, appointment reminders (`REMINDERS_ENGINE=queue`, the default), integration deliveries, Facebook sync and token checks, payload purge, lead imports and lead follow-up reminders. Each has its own retry policy; jobs that fail after all retries appear in the dashboard under **Settings → Failed jobs** with a retry button (`GET /v1/jobs/failed`, `POST /v1/jobs/:id/retry`).

## Health

`GET /health` answers 200 when the database is reachable and 503 when it isn't (not rate limited).

## Tests

```bash
npm test
```

Uses a real PostgreSQL database named by `TEST_PG_DATABASE` (must contain "test"), recreated from the migrations on every run. External calls (Wafly, Facebook Graph, Google Sheets) are stubbed. Suites:

* `test/characterization` — existing dental behaviour pinned before the restructure (auth, patients, bookings, treatments, billing, uploads, imports);
* `test/platform` — tenancy, permissions, cross-cutting concerns, DB hardening, jobs;
* `test/leads` — pipelines, custom fields, leads, forms, integrations, conversion, Google add-on, roles/visibility/export/reminders.

## Docs

* [`docs/leads-module.md`](docs/leads-module.md) — Leads module: data model, API, forms, Facebook and Google setup, jobs, env.
* [`docs/revamp`](docs/revamp) — revamp audit, gap analysis, plan and final report.
