# 03 — Gap Analysis (Dental vs. Reference)

Inputs: [01-reference-architecture.md](01-reference-architecture.md), [02-dental-current-state.md](02-dental-current-state.md).

**Agreed decision (2026-10-07):** the **practice** (today: the doctor who owns clinics, staff and patients) is the tenant. Leads, pipelines, forms, custom fields and integrations are scoped to a practice, and optionally narrowed to a clinic via `clinic_id`.

Each gap has an ID used by 04/05, a severity (🔴 critical / 🟠 high / 🟡 medium / ⚪ low), what the reference does, and the fix. "Ref ⚠️" means the reference is also weak there and we go beyond it.

---

## G1. Security (fix first, independent of restructure)

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G1.1 | `GET /v1/generate-backup` runs `pg_dump`, unauthenticated | 🔴 | Delete the route. Backups move to an ops script (`scripts/backup.sh`, not HTTP). |
| G1.2 | `backup.sql` with patient data and password hashes tracked in git and pushed | 🔴 | `git rm --cached`, add to `.gitignore`. History rewrite (`git filter-repo`) plus a forced password reset for the 14 users is the **owner's decision**, because it needs a force-push. |
| G1.3 | Path traversal: `GET /v1/upload?file_path=` reads any file; `DELETE` removes any file; both unauthenticated | 🔴 | Resolve against an allow-listed root and reject anything outside it (`path.relative` check). GET serves only `public/` (static plugin). DELETE requires auth and that the file belongs to a record in the caller's practice. |
| G1.4 | Public `POST /patients/import`, `/services/import` | 🔴 | Move to the authenticated tree with `requirePermission('patients.import')` / `catalogue.manage`. |
| G1.5 | `POST /auth/register` accepts any `role`; `POST /users` lets any user create admins | 🔴 | Register is restricted to `patient` (or disabled if the patient app doesn't use it; see open question Q3). User creation needs `users.create` plus a rule that you can only create roles below your own. |
| G1.6 | No authorization / IDOR on every resource | 🔴 | `requirePermission()` preHandlers on every route (G5) **and** practice/clinic scoping on every query (G6). |
| G1.7 | Predictable patient credentials (`ddssN` + name/phone-derived password) | 🔴 | Random temporary password (crypto) with a forced change on first login. The username format can stay. Delivered via WhatsApp/SMS template or shown once to staff. |
| G1.8 | JWT payload = full user row incl. bcrypt hash; 30-day access token | 🔴 | Slim claims `{ sub, role, practice_id, ver }`. Access token 15 min, refresh 30 days with rotation. Old-format tokens accepted for a transition window only. Ref ⚠️ (same flaw). |
| G1.9 | Tokens in `localStorage` | 🟠 | Port the reference BFF: Next route handlers set httpOnly cookies. Dashboard API calls go through a Next rewrite (`/api/v1/* → API`) so cookies stay first-party. The bearer header stays supported for the patient app. |
| G1.10 | Request bodies (PII, passwords) logged on every request | 🔴 | Remove body logging. pino with a `redact` list (password, tokens, mobile, email, names, medical fields). Ref ⚠️ (logs public bodies). |
| G1.11 | `verifyToken` doesn't `return` after the missing-header 401 | 🟠 | Rewrite the auth hook (G5). |
| G1.12 | CORS `*`; helmet defaults | 🟡 | `ALLOWED_ORIGINS` allow-list with credentials (ref). Public form/webhook routes get their own permissive CORS without credentials. |
| G1.13 | Multipart limit 5 GB; MIME by client-declared type only | 🟡 | 25 MB default (env). Extension + magic-byte check. Random filenames (no user-supplied names on disk). |
| G1.14 | Wafly API key sent in a GET query string and logged | 🟡 | Single Wafly client. Never log URLs; log the template name and a masked phone. |
| G1.15 | User delete cascades into clinical and billing records | 🔴 | See G7.3. |

## G2. Folder structure & naming

| ID | Gap | Sev | Fix (target in 04) |
|---|---|---|---|
| G2.1 | Server pretends to be a Next app (`next`/`react` deps, `next build/start`, `next.config.mjs`, Next README) | 🟡 | Remove. Scripts: `dev`, `start`, `lint`, `test`, `migrate:*`, `seed:*`. Real README. |
| G2.2 | Bootstrap is all in `server.js` with inline routes | 🟡 | `app/plugins/*` one per concern + `plugins/index.js` registration order (ref). |
| G2.3 | Mixed names: `validation-schemas` vs. ref `validation-schema`; `lib/middlewares` vs. ref `middlewares`; `scheduler/` vs. ref `cron-tasks/`; `helpers/error-handler.js` vs. ref `utils/error-handler.js`; `api/upload_files` snake_case; `api/patients` plural vs. others singular | ⚪ | Adopt the reference names. API folders kebab-case singular (`patient`, `upload-file`). URL prefixes unchanged. |
| G2.4 | Dead `models/index.js` (CJS sequelize-cli stub) | ⚪ | Delete. |
| G2.5 | Dashboard `src/server/` is client code with a misleading name | 🟡 | Becomes `src/services/*-service.js` (ref). |
| G2.6 | Dashboard pages hold fetching, columns and forms inline; `components/forms` has 26 cross-domain forms | 🟡 | `src/features/<domain>/components/*`; app pages become thin (ref). |
| G2.7 | Dashboard `validation-schemas/` | ⚪ | `src/schemas/` (ref). |

## G3. Layering & separation of concerns

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G3.1 | No service layer; business rules, transactions and external calls live in controllers | 🟠 | `api/<module>/service.js` owns rules and transactions. Controllers only parse, call the service and respond. Ref uses services only sometimes; we use them for every module with logic. |
| G3.2 | Model functions take `req` and read `req.body` directly; callers fake `req` objects | 🟠 | Model/repository functions take explicit arguments `(data, { practiceId, transaction })`. Ref ⚠️ (same coupling). Done module by module behind characterization tests. |
| G3.3 | External calls (WhatsApp) inside DB transactions | 🟠 | Commit first, then enqueue a notification job (G9). |
| G3.4 | Schema mutation at runtime (`sync({ alter: true })` in each model `init`) | 🔴 | Remove all `sync`. Umzug migrations (G7.1). |
| G3.5 | Model init not awaited before `listen` | 🟠 | `await` DB connect + model init in the bootstrap before `listen`. |

## G4. Duplicated / dead code

| ID | Item | Action |
|---|---|---|
| G4.1 | `utils/waffly.js` vs `utils/whatsapp-template.js` (5 near-identical senders, 2 broken) | One `services/whatsapp/wafly-client.js` + a template registry |
| G4.2 | `helpers/file.js` vs `helpers/multer.js` (two upload/delete implementations, different MIME lists) | One `utils/file-storage.js` |
| G4.3 | `importPatients` repeats the same treatment block 3× | `PatientImportService` with one `importTreatmentRows()` |
| G4.4 | Dead: `api/otp/*`, `otp.model.js`, `helpers/interaktApi.js`, `helpers/mailer.js`, `views/credentials.ejs`, `helpers/generateId.js`, Joi dependency | Delete (OTP can come back later as a planned feature) |
| G4.5 | Dashboard dead: `utils/api.js`, endpoints for non-existent APIs, sidebar entries for non-existent pages | Delete |
| G4.6 | Hardcoded single-tenant IDs (`CLINIC_ID`, `DOCTOR_ID`, `DOCTOR_USER_ID`, `PROCEDURE_ID`) used by imports | Imports take practice/clinic from the authenticated caller. Env keys removed. |
| G4.7 | Hardcoded clinic phone `8882850066` (8×), "Onlineparts.shop", hardcoded hosts/IPs in `next.config.mjs` | Clinic phone → `clinics.contact_phone` column. Hosts → env. |

## G5. Auth & permissions

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G5.1 | No role middleware | 🔴 | `middlewares/require-permission.js` → `requirePermission('leads.assign')`. `requireRole()` kept for platform-admin routes (ref pattern). |
| G5.2 | Permission granularity | 🟠 | **Action-level** permissions (Ref ⚠️ is module-level only). Tables `roles` (system + per-practice custom) and `role_permissions(role_id, permission_key)`. System roles seeded from the current enum: `admin` (platform), `doctor` (practice owner = all practice permissions), `staff` (default clinical + leads view/create/edit), `patient` (self-service only). `users.role` is kept for compatibility; `users.role_id` is added. |
| G5.3 | Permission catalogue missing | 🟠 | `lib/constants/permissions.js`: `patients.{view,create,edit,delete,import}`, `appointments.*`, `treatments.*`, `billing.*`, `catalogue.manage`, `clinics.manage`, `users.{view,create,edit,delete}`, `reports.view`, **`leads.{view,view_all,create,edit,delete,assign,import,export,convert}`**, **`pipelines.manage`**, **`forms.manage`**, **`custom_fields.manage`**, **`integrations.manage`**. `leads.view` without `view_all` = only leads owned by me. |
| G5.4 | Client-only route guard reading `localStorage.user` | 🟠 | `src/middleware.js` (Next 14) checks the auth cookie server-side. `lib/route-access.js` uses `user.permissions` from `/users/me` (ref pattern). |
| G5.5 | Login requires the client to send `role` | 🟡 | Server derives the role. The `role` field is accepted but ignored (compat). |
| G5.6 | Password change/reset broken (02 §7 #14, #15, #23) | 🟠 | Fix in `AuthService`. The reset flow is implemented with an expiring hashed token, or removed if unused (Q3). |

## G6. Multi-tenancy & data scoping

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G6.1 | No tenant entity | 🔴 | New `practices` table (`id, name, owner_user_id, status, settings JSONB`). Backfill **one practice per existing doctor**. `practice_id` added to `doctors`, `clinics`, `staffs`, `users` (nullable for `admin`), and every tenant-owned table. Migration pattern from the reference: add nullable → backfill → `NOT NULL` + index. |
| G6.2 | Queries are not scoped | 🔴 | `helpers/scope.js` port: `practiceWhere(ctx)`, `practiceCondition(alias)`, `practiceInsert(ctx)`, plus `clinicCondition` when the user is clinic-restricted (staff → `clinic_staff_mappings`). Applied to every repository function. An integration test asserts cross-practice access → 404 for every route. |
| G6.3 | Patients can belong to several clinics/doctors (mapping tables) | 🟡 | A patient belongs to one practice (`patients.practice_id`). Clinic mappings remain. A patient shared across two doctors today (if any) is reported by the backfill migration rather than silently split (see 05 risk R3). |

## G7. Database design

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G7.1 | No migrations; live schema ≠ code (legacy tables `appointments`, `dental_charts`, `dental_notes`, `prescriptions`, `models`) | 🔴 | Umzug (`scripts/migrate.js`, ref). **Baseline migration** generated from a production copy (`pg_dump --schema-only`). `migrate:baseline` marks it executed on existing DBs; on a fresh DB it creates the schema. Legacy tables are left untouched in the baseline. Dropping them is a separate, explicitly approved migration after a data check. |
| G7.2 | Missing uniqueness | 🟠 | Unique `(clinic_id, patient_id)`, `(clinic_id, staff_id)`, `(doctor_id, patient_id)`, `(doctor_id, service_id)`, `doctors.user_id`, `patients.user_id`, `staffs.user_id`. The migration **aborts with a duplicate report** if existing data violates a constraint; nothing is auto-deleted. |
| G7.3 | `added_by`/`created_by → users ON DELETE CASCADE` on clinical/billing rows | 🔴 | Change to `ON DELETE RESTRICT`. Users are soft-deleted / deactivated instead of hard-deleted. |
| G7.4 | No soft delete | 🟠 | `deleted_at` (Sequelize `paranoid`) on `users, patients, clinics, treatments, treatment_payments, ledgers, documents, xrays, notes, bookings` and all new leads tables. Every raw-SQL query gets `AND x.deleted_at IS NULL` (enforced by a repository test per table). |
| G7.5 | Audit fields | 🟡 | `created_by`/`updated_by` (nullable FK `SET NULL`) on tenant tables that lack them. Uniform `created_at`/`updated_at`. |
| G7.6 | Missing indexes for hot paths | 🟠 | `bookings (clinic_id, date, slot)`, `bookings (status, date)` for the cron, `treatments (patient_id, clinic_id)`, `treatment_payments (treatment_id)`, `treatment_plans (treatment_id)`, `clinic_patient_mappings (patient_id)`, `users (mobile_number)`, all FK columns without an index, `practice_id` on every tenant table. |
| G7.7 | Weak types: `dob STRING`, `height_in_cm STRING`, vitals STRING, `visit_notes JSONB DEFAULT 0`, `''` used as an enum value | 🟡 | `dob → DATE` (migration parses; unparseable → null + report). `visit_notes` default `[]`. Empty-string enums stay for compatibility (changing them breaks clients); documented as a known deviation. Vitals stay strings (free-form units). |
| G7.8 | Money stored as `INTEGER` | ⚪ | **Intentionally kept** (whole rupees; changing to NUMERIC changes the JSON type to string and breaks clients). Documented in 06. |
| G7.9 | Patient-number sequence race | 🟠 | Postgres `SEQUENCE patient_number_seq` initialised from `patient_sequences.value`. The old table is kept read-only for one release. |

## G8. API shape, errors, validation

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G8.1 | Inconsistent response shapes | 🟠 | Standard envelope `{ status: true, data, message?, meta? }` with lists as `data: [...]` + `meta: { page, limit, total }`. **Compatibility:** endpoints consumed by the patient app (Q3) keep their current shape until that app is updated; this is tracked in a compat list. |
| G8.2 | Error handler leaks internals; no 403/409 | 🟠 | Port the reference handler (Zod→400 with field list, unique→409, any `statusCode` 4xx passthrough) **plus**: 500 returns a generic message + `request_id`, and the detail goes only to the log. `AppError(statusCode, code, message)` helper. |
| G8.3 | Parsed Zod output ignored; many modules unvalidated; no params/query validation | 🟠 | Every route declares body/params/query Zod schemas, and the controller passes **only the parsed value** to the service. A shared `pagination` schema (`page ≥ 1`, `limit ≤ 100`) and a `uuid` param schema. |
| G8.4 | Wrong status codes (409 for not found, 404 for wrong password) | 🟡 | Corrected via `AppError`. |
| G8.5 | Unbounded list queries (`limit = null`) | 🟠 | Default limit 20, max 100. |

## G9. Background jobs, logging, observability

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G9.1 | No job queue; reminder cron misses windows when down; WhatsApp sent inline | 🟠 | **pg-boss** (Postgres-backed queue: no new infra, retries with backoff, dead-letter, scheduling). Ref ⚠️ (no queue). Reminders become scheduled jobs created at booking time (`send_at`), idempotent by `(booking_id, kind)`, so missed windows are caught up on restart within a grace period. |
| G9.2 | Logging | 🟠 | pino (Fastify logger) JSON in prod, pretty in dev, `redact` paths, `request_id` on every log line, no `console.*` (lint rule). |
| G9.3 | No failed-job visibility | 🟡 | Admin endpoint + screen listing failed jobs with a retry action (shared with the integration log). |
| G9.4 | Health | ⚪ | `GET /health` (db + queue). |

## G10. Tests & tooling

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G10.1 | Zero tests (both projects; ref too) | 🔴 | Server: **Vitest** + `fastify.inject` against a real Postgres test DB (migrated fresh per run, transaction-per-test). Dashboard: Vitest + React Testing Library for hooks/critical forms. |
| G10.2 | No server lint | 🟡 | ESLint (flat config) + prettier, `no-console`. |
| G10.3 | No CI | ⚪ | `npm run verify` = lint + test + migrate up/down check. A GitHub Actions workflow file is provided; enabling it is the owner's call. |

## G11. Config & env

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G11.1 | No `.env.example` (both repos) | 🟠 | Add and keep current. |
| G11.2 | No boot validation | 🟠 | `app/config/index.js` validates env with Zod at startup and fails fast with a list of missing keys (Ref ⚠️ doesn't). |
| G11.3 | Direct `process.env` reads scattered around | 🟡 | All reads go through config. A lint rule bans `process.env` outside `app/config`. |
| G11.4 | `PG_PORT` hardcoded | ⚪ | Env-driven. |

## G12. Dashboard UI / component structure

| ID | Gap | Sev | Fix |
|---|---|---|---|
| G12.1 | No services/hooks layer; TanStack Query inline in 91 components; ad-hoc query keys | 🟡 | `services/*-service.js` (axios only) → `hooks/use-*.jsx` (query + mutation, toasts, invalidation, key factory) → `features/*`. |
| G12.2 | Contexts as global store (`MainContext`, `ClinicContext`, `ExaminationContext`) | ⚪ | Keep React context for auth user + selected clinic (`providers/auth-provider.jsx`, `providers/clinic-provider.jsx`). Server data moves to Query. No new state library (the ref doesn't use one either). |
| G12.3 | Forms monolith (`components/forms`, ~6k lines) | 🟡 | Each form moves to its feature folder unchanged first, then is refactored onto shared field components. |
| G12.4 | No error boundary / not-found page | ⚪ | `app/error.jsx`, `app/not-found.jsx` (ref). |

---

## G13. Leads module: required capabilities vs. reference

| Capability (task spec) | Reference | Dental target |
|---|---|---|
| Multiple pipelines, ordered stages, CRUD, reorder, default, **archive instead of hard delete** | ✅ CRUD, primary flag, duplicate; ⚠️ hard delete | ✅ + `archived_at`; delete is blocked when leads exist (archive instead) |
| Stage: name, order, **colour**, probability, type open/won/lost, **required fields on entry** | ⚠️ no colour, no required fields | `color` column; `required_fields JSONB` (list of core field keys / custom field ids, validated in `LeadService.moveStage`) |
| Stage moves logged | ⚠️ history table never written | `lead_stage_history` written in the same transaction + timeline entry |
| Leads: assign, source, **tags**, status, notes, follow-ups, timeline | ✅ except ⚠️ no tags | `tags` + `lead_tags`; `status` (open/won/lost/converted) kept in sync from the stage type |
| List + kanban, filters, search, **bulk actions**, pagination | ✅ list/kanban/filters; bulk assign only | bulk assign / move stage / tag / delete; server pagination; kanban per-column pagination |
| Form builder, **public embeddable form, shareable link, spam protection**, auto-assignment | ⚠️ builder only; public endpoint without spam protection; tenant from body | Public slug, hosted page `/f/:slug`, iframe embed snippet, honeypot + min-fill-time token + per-IP/per-form rate limit + optional Turnstile; tenant resolved from the form slug, never from the body |
| Custom fields, typed, reusable, **values stored properly** | JSONB array snapshot on the lead + GIN | **Typed value table** `lead_custom_field_values(lead_id, custom_field_id, value_text, value_number, value_date, value_bool, value_json)` with per-type partial indexes. Justification: filterable with normal btree indexes, type-checked, safe to rename fields. The reference's snapshot rationale is covered by `form_submissions.payload` keeping the submitted snapshot. |
| Facebook Lead Ads | ✅ OAuth, page/form picker, webhook verify + HMAC, Graph fetch, pull-sync, custom-field matching, events log; ⚠️ no OAuth state, unbound bundle, no long-lived token or expiry tracking, inline processing | Port + fix: signed `state` bound to practice+user; bundle bound to practice+user with a 15-min TTL; long-lived user token exchange; `debug_token` expiry stored and surfaced on a status screen with a reconnect CTA; webhook → enqueue → worker; retries; PII-redacted log |
| Dedupe | provider-id only | provider-id **and** normalised phone (E.164 via libphonenumber, default region `IN`) / lowercased email per practice; policy per installation: `merge` (attach activity to the existing open lead) / `create_flagged` / `skip` |
| Conversion to patient (+ optional appointment) | converts to a "client" (different domain) | `LeadConversionService` reuses `PatientService.create` and `BookingService.create` (same slot/capacity rules); offers to link an existing patient matched by phone; `leads.converted_patient_id` + `patients.source_lead_id` |
| Google Ads Lead Form webhook + Sheets/CSV import (add-on, per practice/clinic switch) | ❌ | Provider interface shared with Facebook; `practice_features` switch (see 04 §4) |
| Integration log, failed jobs, retry | events table only | `integration_events` (redacted payload + encrypted raw payload with 30-day retention for replay) + pg-boss failed-job view + retry |
| Seeds | — | Default "New Patient Enquiries" pipeline per practice: New Enquiry (open, 10%) → Contacted (20%) → Consultation Booked (50%) → Treatment Plan Shared (70%) → Won – Treatment Started (won, 100%) → Lost (lost, 0%). Sources: Walk-in, Phone Call, Website, Facebook, Instagram, Google, Referral, WhatsApp. Interest custom field (multi-select): Implants, Braces/Aligners, Cleaning/Scaling, Root Canal, Whitening, Crowns/Bridges, Dentures, Extraction, Kids Dentistry, Consultation. |

---

## Not porting from the reference (and why)

| Reference item | Reason |
|---|---|
| Cluster mode (primary cron + 4 workers) | Dental runs one small instance; pg-boss workers can be scaled later without cluster |
| Module-level-only permissions + in-process cache under cluster | Replaced by action-level permissions; single process for now (cache keyed by role with 60 s TTL) |
| Email/WhatsApp-bot/LLM/billing/process modules | Out of scope |
| Real-estate portal adapters (99acres, Housing, MagicBricks, IndiaMart) | Not dental; the provider interface allows them later. A generic `custom_webhook` provider *is* ported |
| `round_robin_counters` table | Superseded by the pipeline cursor (as in the ref itself) |
| JSONB custom-field storage on the lead | Replaced by the typed value table (justified above) |
| `api/lead/service.js` in-memory stub, duplicated kanban folders | Dead code in the ref |
| Body logging on public routes; full-user JWT; 30-day access token | Security |
