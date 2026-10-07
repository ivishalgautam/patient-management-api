# 05 — Implementation Plan

Ordered and incremental. Every step ends with **build + lint + tests green** and a commit on `revamp/leads-module` (server and dashboard repos separately). Gap IDs refer to [03](03-gap-analysis.md); paths and migrations to [04](04-target-structure.md).

Legend: **Risk** = what can go wrong; **Rollback** = how to undo that step.

---

## Open questions (answers change the plan)

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Hotfix the live 🔴 holes (G1.1, G1.3, G1.4, G1.5) on `master` now, ahead of the revamp? | Do it as **Step 0** on a separate `hotfix/security` branch for you to merge/deploy |
| Q2 | Rewrite git history to purge `backup.sql` (force-push) and force a password reset? | Untrack + gitignore only; history rewrite left to you |
| Q3 | Which client consumes the patient-facing endpoints (website/app, repo location)? We must not break it. | Treat **every existing endpoint's response shape as frozen** (compat list); only add fields |
| Q4 | Job queue: pg-boss (Postgres, no new infra) vs. BullMQ (needs Redis) | pg-boss |
| Q5 | Can you provide a **restored copy of the production DB** (local/staging) for the baseline migration and migration testing? | Required before Step 3.3. Without it, the baseline comes from `backup.sql`, which may be stale |
| Q6 | Framework upgrades (Fastify 5, Next 15/16, TanStack Query 5)? | Out of scope; stay on current majors |
| Q7 | Do you have a Meta app with **Advanced Access to `leads_retrieval`** (business verification)? | Build + test against Meta's Lead Ads Testing Tool in development mode |
| Q8 | Spam protection: enable Cloudflare Turnstile? | Honeypot + min-fill-time + rate limit on; Turnstile available via env, off by default |
| Q9 | Is self-registration (`POST /auth/register`) used by the patient app? | Keep it, limited to role `patient` |

## Assumptions (configurable)

* **A1 – Google Ads Lead Form webhook:** Google POSTs JSON `{ lead_id, form_id, campaign_id, adgroup_id, creative_id, gcl_id, api_version, is_test, google_key, user_column_data: [{ column_id, column_name?, string_value }] }` to the webhook URL configured in the Ads lead form. Verification = constant-time compare of `google_key` with the per-integration secret ("shared `google_key`"). Each integration gets its own URL token **and** key; column ids such as `FULL_NAME`, `PHONE_NUMBER`, `EMAIL` map to core fields, and any other column maps through the field-mapping UI. `is_test: true` leads are ingested with a `test` tag (toggleable). Unknown `api_version` is accepted and logged.
* **A2 – Google Sheets:** v1 supports (a) CSV/XLSX upload and (b) a Google Sheet shared as "anyone with the link" or "published to web", fetched as CSV via its export URL (no OAuth). OAuth-based private-sheet access is behind the provider interface as a later option (`GOOGLE_SHEETS_OAUTH_ENABLED=false`). Imports are one-off or manually re-run; no live sync in v1.
* **A3 – Phone normalisation:** default region `IN` (`DEFAULT_PHONE_REGION`). Unparseable numbers are stored raw and excluded from phone dedupe.
* **A4 – Lead visibility:** staff see leads for clinics they're mapped to and practice-wide leads (`clinic_id NULL`). `leads.view_all` is required to see other owners' leads.
* **A5 – Retention:** encrypted raw integration payloads are purged after 30 days (`INTEGRATION_PAYLOAD_RETENTION_DAYS`). Redacted payloads are kept.
* **A6 – Facebook pull-sync:** every 10 min (`FB_PULL_SYNC_CRON`), first run looks back 24 h, Meta rate-limit codes pause 30 min (as in the ref).
* **A7 – Session cookies:** the dashboard calls the API through a Next rewrite (`/api/v1/*`), so auth cookies are first-party. Bearer tokens stay supported for the patient app.

---

## Step 0 — Security hotfix (separate branch off `master`, only if Q1 = yes)

Remove `/v1/generate-backup`; confine `GET /v1/upload` to `public/` and require auth on `DELETE`; move both imports behind auth + admin/doctor role; restrict `/auth/register` to `patient` and `POST /users` role creation by caller role; fix the `verifyToken` missing `return`; stop logging request bodies; untrack `backup.sql`.
**Risk:** a client relying on one of these behaviours (e.g. the public site fetching uploads via `GET /v1/upload`). The GET keeps working for files under `public/`. **Rollback:** revert the single hotfix commit.

## Phase 3 — Restructure (no behaviour change except listed bug fixes)

| Step | Work | Risk | Rollback |
|---|---|---|---|
| 3.1 Tooling | Server: ESLint/prettier, Vitest, `test/setup` (test DB, app factory, factories, auth helper), `.env.example`, remove Next deps/scripts/README boilerplate. Dashboard: Vitest + RTL, `.env.example`. | Lint noise | Revert commit; nothing runtime-related changes |
| 3.2 Characterization tests | API tests for the regression baseline in 02 §10 (login per role, clinic/slot setup, patient create, booking + capacity + completion → treatment, plan/prescription/visit/payment/advance ledger, reports, cron reminder selection logic with a fake clock, public catalogue). Written against **current** behaviour; the known bugs are captured as `it.fails`/`todo` and flipped when fixed. | Hard to test the Wafly calls | Wafly client stubbed via DI; tests are additive |
| 3.3 Migrations foundation | Umzug + `scripts/migrate.js` + idempotent helpers; M000 baseline from a prod copy (Q5); `migrate:baseline`; **remove every `sync({ alter: true })`**; await init before `listen`. | Baseline ≠ prod ⇒ fresh envs differ | Baseline is diffed against a `pg_dump --schema-only` of the prod copy in a test (`schema-diff` script must be empty). Rollback: revert; re-enabling sync is a one-line revert per model |
| 3.4 Bootstrap & cross-cutting | `app.js` + `plugins/*`; Zod config; pino + redact + request_id; CORS allow-list; multipart limits; `utils/error-handler.js` + `AppError` + `reply.ok()`; `GET /health`. | Error shape changes visible to clients | Envelope keys `status/message/data` unchanged; only 500 text becomes generic. Revert commit |
| 3.5 Auth | `plugins/auth.js`; slim JWT; short access + rotating refresh; old-token grace period (`LEGACY_TOKEN_GRACE_UNTIL`); login derives role; fix change-password/update-password bugs; random temporary patient passwords. | Logs everyone out if the grace period is misconfigured | Grace period accepts old tokens; flip env to restore old expiry |
| 3.6 Tenancy | M001–M003 (practices + practice_id + backfill) and `helpers/scope.js`; `ctx.practiceId/clinicIds`; repositories scoped; **cross-tenant test matrix** (every route × foreign practice ⇒ 404). | Backfill ambiguity (shared patients); a missed query leaks data | M002 aborts with a report; the test matrix enumerates routes from the Fastify route table so new routes can't skip it. Rollback: `migrate:down` to M000 (columns dropped; no data lost since only added) |
| 3.7 Permissions | M004 roles/permissions + seeds; `requirePermission` on every route (route-table test asserts each non-public route declares a permission); `/users/me` returns permissions. | Locking real users out | System roles seeded to match **today's effective access** of the dashboard role map; doctor = all. Rollback: env `PERMISSIONS_ENFORCE=false` logs denials instead of blocking (kept for one release) |
| 3.8 Module-by-module layering | For each module (order: auth → users → clinic → slot/block-slot → booking → patient → treatment family → payment/ledger → report → catalogue → upload): add `service.js`, explicit-arg repositories, full Zod schemas (body/params/query, parsed output only), fix transaction leaks, move WhatsApp calls after commit. One commit per module; characterization tests must stay green. | Behaviour drift | Small commits, each revertable; tests pin behaviour |
| 3.9 DB hardening | M005 FK RESTRICT; M006 uniques (abort-on-duplicates); M007 soft delete (+ `deleted_at IS NULL` in every raw query, enforced by repo tests); M008 audit + indexes; M009 sequence; M010 dob; M011 clinic phone. | Duplicate data blocks M006; soft delete misses a query | Pre-check reports; per-migration `down`; run the full up/down cycle on the prod copy |
| 3.10 Jobs | pg-boss plugin (M012); Wafly client; booking confirmation + reminders as idempotent jobs; failed-jobs API. | Duplicate or missed reminders during cutover | Jobs keyed `(booking_id, kind)` + existing `notification_*_sent` flags still honoured; old cron disabled only after a parity test. Rollback: env flag `REMINDERS_ENGINE=legacy` |
| 3.11 Dead code & naming | Deletions and renames from 03 G2/G4; untrack `backup.sql`. | Breaking an import | Lint (`import/no-unresolved`) + tests |
| 3.12 Dashboard restructure | BFF auth routes + rewrite proxy + `middleware.js`; providers; `services/` + `hooks/` per domain; move pages' inline components to `features/`; forms to features; delete dead code. One domain per commit; `next build` + lint + RTL tests each time; manual smoke checklist per role. | Visual regressions | Moves are mechanical first (no logic change), refactors second. Rollback per commit |

**Phase 3 exit:** all characterization tests green (with the known-bug tests flipped to passing), cross-tenant + permission matrices green, `migrate up → down → up` clean on a fresh DB **and** on the prod copy, `next build` clean.

## Phase 4 — Leads core

| Step | Work | Notes |
|---|---|---|
| 4.1 | M020–M029 + seeds (default pipeline/stages/sources/Interest field per practice) | idempotent seeds; re-runnable |
| 4.2 | Pipelines & stages API: CRUD, reorder (single transaction, deferrable unique position), set default, archive/unarchive, delete blocked when leads exist, members (round-robin pool) | `pipelines.manage` |
| 4.3 | Custom fields API: CRUD/archive, typed value validation (`lib/custom-field-types.js`), reusable on forms + lead screens | `custom_fields.manage` |
| 4.4 | Leads API: create/edit/delete(soft)/assign/bulk (assign, move stage, tag, delete)/search (trigram)/filters (pipeline, stage, owner, source, tag, status, clinic, date range, custom filterable fields)/pagination; `moveStage` validates pipeline membership + `required_fields`, writes history + timeline in one transaction; round-robin assignment (ported, row lock); tags; activities/notes/follow-ups; follow-up reminder job; dedupe on manual create (warn + link) | `leads.*` permissions; `view` vs `view_all` |
| 4.5 | Forms: builder API (fields, validation, sections, order, width), slug, settings, assignment rule; **public**: `GET /v1/public/forms/:slug` (definition), `POST /v1/public/forms/:slug/submissions` (honeypot, signed render token with min-fill-time, per-IP + per-form rate limit, optional Turnstile, sanitisation, `form_submissions` snapshot) → `website-form` provider → ingest | tenant from slug only |
| 4.6 | Integration framework: registry, `ingest.js` (dedupe policies, refs, events, never throws), redaction, encrypted payload + purge job, `integrations` API (install/update/disable/rotate token/test/events/retry), failed-job view | ported from ref `lib/apps` |
| 4.7 | Facebook Lead Ads provider: signed `state`, `oauth_sessions` bound to practice+user with TTL, long-lived token exchange, page/form selection, subscribe, `debug_token` expiry → `token_expires_at` + daily `fb-token-check` job (sets `needs_reauth`), webhook GET handshake + POST `X-Hub-Signature-256` → enqueue → worker fetches Graph lead → field mapping (core + custom via normalised keys) → ingest; pull-sync safety net; status screen | Graph version from env |
| 4.8 | Conversion: `POST /leads/:id/convert` → match existing patient by phone (link) or create via `PatientService` → optional booking via `BookingService` (same rules) → lead `converted` + links both ways + timeline | one transaction; WhatsApp after commit |
| 4.9 | Dashboard: leads list + kanban (`@dnd-kit`), filters/search/bulk, lead detail (timeline, notes, follow-ups, custom fields, convert dialog), pipelines + stage editor (reorder, colour, probability, type, required fields), custom fields, form builder + share/embed page, hosted `/f/[slug]`, integrations (Facebook connect → page/form picker → mapping → status/logs), roles & permissions screen, failed jobs | features/* pattern |
| 4.10 | Tests: pipelines (reorder, default, archive rules), stages (required fields, history), custom fields (type validation, filtering), forms (validation, spam, rate limit, tenant isolation), ingestion (Facebook signature/handshake/fetch/mapping/pull-sync with nock), dedupe (each policy, phone formats), permissions matrix for every leads route, conversion | |

## Phase 5 — Google Leads add-on

| Step | Work |
|---|---|
| 5.1 | `practice_features` toggle UI/API (`google_leads`, per practice or clinic); registry hides disabled providers; webhook returns 404 when disabled |
| 5.2 | `google-ads-lead-form` provider (A1): per-integration URL token + `google_key`, constant-time verify, `user_column_data` → core/custom mapping (mapping UI with Google's standard column ids pre-filled), `is_test` handling → ingest job |
| 5.3 | `sheet-import` provider (A2): upload CSV/XLSX or sheet URL → parse (streaming, row cap `IMPORT_MAX_ROWS`) → column→field mapping UI with auto-match → preview (first 20 rows) → **dry-run** (validation + dedupe outcome per row, no writes) → run as job (batches of 200, per-row result) → error report CSV download → import history |
| 5.4 | Tests: google_key verification, mapping, test-lead handling, feature switch off ⇒ 404, CSV parsing edge cases (BOM, encodings, quoted commas), dry-run writes nothing, dedupe policies on import, error report content |

## Phase 6 — Docs & final report

README (setup, scripts, env, migrations, jobs, tests) for both repos; `docs/leads-module.md` (data model, endpoints, Facebook + Google setup step by step, webhook URLs, env); `.env.example` final; `docs/revamp/06-final-report.md`.

---

## Risk register

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Breaking the patient app/website (unknown consumer, Q3) | M / H | Frozen response shapes for existing endpoints; bearer auth retained; compat tests on public + patient endpoints |
| R2 | Baseline migration doesn't match prod | M / H | Generate from a prod copy; automated schema diff; never run M000 `up` against prod (only `baseline` mark) |
| R3 | Tenancy backfill ambiguity (patients linked to 2+ doctors) | L / H | M002 detects and aborts with a report; explicit opt-in resolution |
| R4 | Missed scoping/permission on a route | M / H | Route-table-driven test matrices fail if any route lacks a permission or leaks across practices |
| R5 | Logout storm / auth regressions on the token change | M / M | Legacy-token grace window; refresh flow tested |
| R6 | Reminder duplicates during the job-engine cutover | M / M | Idempotency keys + existing sent flags; legacy engine flag |
| R7 | Meta review / Advanced Access not granted (Q7) | M / M | Dev-mode testing tool; pull-sync works with the same token; clear status screen |
| R8 | Google webhook format differs from A1 | L / M | Raw (encrypted) payload kept 30 days + replay after a mapping fix; unknown fields logged |
| R9 | Large diff ⇒ hard review | H / M | Small per-module commits, phase-tagged; each phase reviewable on its own |
| R10 | Unique-constraint migration blocked by dirty data | M / L | Abort-with-report; you decide merges |

## Rollback strategy (global)

* **Code:** each phase ends with a tag (`revamp-phase3`, `-phase4`, `-phase5`) on both repos; deploy any tag independently of later ones.
* **DB:** every migration has a tested `down`; `migrate:down` to the previous phase's last migration restores the schema. Leads tables are additive, so rolling back Phase 4/5 does not touch dental data. Phase 3 migrations that transform data (M007 soft delete, M010 dob) keep the original values (`dob_legacy`; `down` refuses to drop non-empty `deleted_at` without `--force`).
* **Runtime flags (one release):** `PERMISSIONS_ENFORCE`, `REMINDERS_ENGINE`, `LEGACY_TOKEN_GRACE_UNTIL`, and the per-practice `practice_features` for leads and integrations.
* **Before production deploy:** full `pg_dump` backup via `scripts/backup.sh`, run migrations on staging (prod copy) first.
