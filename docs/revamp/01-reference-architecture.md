# 01 — Reference Architecture (BW Task)

Source: `D:\Vishal\bw-task-full-source` (read-only). Audited 2026-10-07 at commit `6da3883`.

This document records **what the reference does**, including the parts we should *not* copy. Items marked ⚠️ are weaknesses in the reference that the dental port must improve on rather than replicate.

---

## 1. Stack

| Layer | Reference (BW Task) | Dental (for comparison) |
|---|---|---|
| Runtime | Node, ESM (`"type": "module"`) | same |
| HTTP | Fastify **5.6** | Fastify **4.18** |
| ORM / DB | Sequelize 6 + PostgreSQL | same |
| Migrations | **Umzug 3** (`scripts/migrate.js`, `migrations/*.js`, `SequelizeMeta` table) | none — `Model.sync({ alter: true })` on boot |
| Seeders | Umzug (`scripts/seed.js`, `seeders/*.js`) | `findOrCreate` inside a model `init()` |
| Validation | Zod 4 (`app/validation-schema/*`) | Zod 3 (`app/validation-schemas/*`) + unused Joi |
| Scheduling | toad-scheduler, `CronJob` per task (`app/cron-tasks/*`) | toad-scheduler, one job |
| Cache / queue | ioredis plugin present but **not registered** (`plugins/index.js`, commented out) | none |
| Process model | `cluster` — primary runs cron; up to 4 workers serve HTTP | single process |
| Client | Next.js **16**, React 19, TanStack Query **5**, nuqs 2, react-hook-form, Zod, Tailwind 4, shadcn/ui, `@dnd-kit` (kanban) | Next.js 14, React 18, TanStack Query 4, nuqs 1, Tailwind 4, shadcn/ui |
| Mobile | Expo / React Native (`client/mobile`) | none |
| Tests | **None** (no test runner, no test files) | none |

Because both projects share the same family (Fastify + Sequelize + Postgres + Next), **we port the design directly; no stack change is needed**. The Fastify 4→5, TanStack Query 4→5, and Next 14→16 upgrades are independent of the revamp. They are treated as optional in the plan.

---

## 2. Server folder structure

```
server/
├── index.js                 # cluster bootstrap: primary = cron app, workers = HTTP
├── server.js                # → app/plugins/index.js
├── scripts/
│   ├── migrate.js           # Umzug up | down | status  (down blocked in production)
│   └── seed.js
├── migrations/              # one file per change, timestamp-prefixed
│   └── _helpers/            # idempotent-ddl.js (createTableIfNotExists, addIndexIfNotExists), add-organization-id-column.js
├── seeders/
└── app/
    ├── config/index.js      # single env → config object (+ firebase.js, razorpay.js)
    ├── plugins/             # one Fastify plugin per concern (fastify-plugin wrapped)
    │   ├── index.js         # registration order: rawBody → rate-limit → helmet → cors → static → cookie → formbody → multipart → scheduler → [cron] → routes
    │   ├── security.js cors.js cookie.js rate-limit.js multipart.js static.js view.js
    │   ├── scheduler.js     # decorates fastify.scheduler (ToadScheduler), stops onClose
    │   ├── cron.js cron-status.js redis.js swagger.js compress.js db.js
    ├── routes/v1/
    │   ├── index.js         # authenticated tree: onRequest → verifyToken, registers every api/* module
    │   └── public.js        # unauthenticated tree: public forms, webhooks, OAuth callback
    ├── api/<module>/
    │   ├── routes.js        # route table + preHandlers (requireModule / requireRole / multipart)
    │   ├── controller.js    # HTTP adapter: parse → call model/service → shape response
    │   └── service.js       # (only some modules) business logic spanning several models
    ├── db/
    │   ├── postgres.js      # Sequelize instance
    │   ├── models.js        # aggregator: { LeadModel, PipelineModel, ... }
    │   ├── index.js         # init() every model
    │   └── models/*.model.js  # schema + data-access functions (repository) in one file
    ├── validation-schema/   # Zod schemas per module
    ├── middlewares/         # require-role, require-module, require-plan-feature, multipart-prehandler
    ├── helpers/             # auth.js (JWT), scope.js (tenant scoping), oauth-state.js, app-store-encryption.js, normalize-phone.js …
    ├── lib/
    │   ├── constants/       # table names, MODULES, rate-limit, time
    │   ├── apps/            # ★ integration framework: registry.js, lead-ingest.js, adapters/*, json-path-lite.js, facebook-custom-fields.js
    │   ├── lead-owner-assignment.js   # round-robin owner
    │   ├── module-permissions.js      # role → allowed modules (in-memory cache)
    │   └── mailer.js, llm/, whatsapp/ …
    ├── services/            # cross-module services (external-lead.service.js, waffly.js, pdf/, billing/ …)
    ├── cron-tasks/          # one file per job, each exports register<Job>(scheduler)
    ├── utils/               # error-handler.js, file.js, send-mail.js, cache.js …
    ├── logger/index.js      # pino instance (⚠️ barely used — most code still console.*)
    └── views/emails/        # EJS templates
```

### Layering in practice

`routes.js → controller.js → (service.js) → db/models/*.model.js → Sequelize/raw SQL`

* Model files are **both** schema definition **and** repository: each exports `init(sequelize)` plus functions like `create(req, transaction, organizationId)`, `get(req)`, `getById(req, id)`.
* ⚠️ Model functions take the whole `req`, which couples the data layer to HTTP. Many call sites build fake requests (`{ body: {...}, user_data: { id: null } }`) to reuse them, e.g. `lib/apps/lead-ingest.js`.
* `service.js` exists only where logic spans several models (`organization-apps`, `process-templates`). ⚠️ `api/lead/service.js` is a leftover in-memory `Map` stub that nothing in production uses.
* Raw SQL with `:named` replacements is used for list queries (joins, JSON aggregation, `COUNT(*) OVER()`).

---

## 3. Config & environment

* `app/config/index.js` loads `dotenv/config` once and exposes a typed-ish object grouped by concern (`app_store`, `whatsapp`, `deepcall`, …).
* `.env.example` exists and is commented, including *why* each secret is separate (e.g. `RAZORPAY_WEBHOOK_SECRET` vs. API secret).
* `ALLOWED_ORIGINS` is a CSV allow-list feeding CORS with `credentials: true`.
* ⚠️ There is no validation at boot: a missing `JWT_SECRET` or `APP_STORE_ENCRYPTION_KEY` only fails when first used. Some modules read `process.env.*` directly (`helpers/oauth-state.js`, `app-store-encryption.js`) instead of going through config.

Integration env keys: `APP_STORE_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM), `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN`, `FACEBOOK_GRAPH_API_VERSION` (default `v26.0`), `API_URL`, `APP_URL`.

---

## 4. Auth, RBAC, multi-tenancy

### Authentication (`helpers/auth.js`)
* JWT access token (30 days, `constants.time.TOKEN_EXPIRES_IN`) + refresh token (`JWT_REFRESH_SECRET`).
* `verifyToken` accepts `Authorization: Bearer` **or** an httpOnly `token` cookie, then re-loads the user from the DB on every request. For non-super-admins it also checks that the organization exists and is `active`, and sets `req.user_data`, `req.organization`, and `req.organization_id`.
* Client side: Next.js route handlers (`app/api/login/route.js`, `refresh-token`, `logout`) exchange credentials with the API and store tokens in **httpOnly, sameSite=lax, secure-in-prod cookies**. Browser JS never sees the token. `src/proxy.js` (Next 16 middleware) guards routes server-side.
* ⚠️ The access token embeds the full user row (`jwt.sign({ user: userData })`), so the password hash travels inside a bearer token. The 30-day access lifetime makes the refresh token nearly pointless.

### Authorization
* **Role** (`users.role` enum: `super_admin | admin | manager | employee | sales …`) → `middlewares/require-role.js` → `requireRole("admin")`.
* **Role Manager / module permissions**: `roles` (per org, `is_system` flag) + `role_module_permissions (role_id, module_key)`. `requireModule("crm")` gates a whole route tree. Results are cached in-process per `role_id`, with explicit invalidation when permissions change.
* Client mirrors this in `lib/route-access.js` using `user.allowed_modules` from `GET /users/me`.
* ⚠️ Granularity is **module-level only** (e.g. "crm"). There is no action-level permission (view vs. create vs. delete vs. assign). Every Leads route sits behind just `requireModule("crm")`. Org-app write routes add `requireRole("admin")`.
* ⚠️ The in-process cache is wrong under `cluster` (4 workers): invalidation in one worker does not reach the others. The file's own comment admits this.

### Multi-tenancy (`helpers/scope.js`)
* Shared-schema tenancy: every tenant table has `organization_id UUID NOT NULL REFERENCES organizations ON DELETE CASCADE` plus an index.
* Three helpers keep scoping mechanical and greppable:
  * `orgWhere(req, extra)` for Sequelize `where`
  * `orgCondition(alias)` for raw SQL (`alias.organization_id = :organization_id`, always pushed first)
  * `orgInsert(req)` spread into every `create()`
* Retrofitted through a careful migration series (`20260905000005…13`): add a nullable column → backfill a default org → flip to `NOT NULL`. **This is the template we will use to add `clinic_id`/tenant scoping to dental tables.**

---

## 5. Cross-cutting conventions

| Concern | Reference behaviour |
|---|---|
| **Response shape** | `{ status: true, data, message? }` on success; `{ status: false, error?, message }` on failure. Lists return `data: { <entity>s: [...], total }` or `data: [...]` (⚠️ inconsistent between modules). |
| **Errors** | `utils/error-handler.js` maps `ZodError`→400, `SequelizeUniqueConstraintError`→409 (strips `organization_id` from field list), Fastify validation→400, 401/404/429, **any `error.statusCode` 4xx → that code**, else 500. It also cleans up uploaded files on error. Services throw `Object.assign(new Error(msg), { statusCode })`. ⚠️ 500 responses echo `error.message` to the client. |
| **Validation** | Zod in controllers (`schema.parse(req.body)`); dynamic schemas for custom fields (`helpers/build-validation-schema.js`, client `lib/build-custom-fields-schema.js`). ⚠️ Parsed output is often discarded and `req.body` is used afterwards. |
| **Logging** | Fastify `logger: true` + `app/logger` (pino). ⚠️ Most code uses `console.log/error`. ⚠️ `routes/v1/public.js` logs **every public request body** (`JSON.stringify(request.body)`), including in production. That is a PII leak; do not copy it. |
| **Rate limiting** | Global `@fastify/rate-limit` (`MAX_RATE_LIMIT`/`TIME_WINDOW`). No per-route limits on public forms. |
| **Security headers** | helmet with CSP disabled. |
| **Raw body** | `fastify-raw-body` registered with `global:false`; routes opt in via `config: { rawBody: true }` (used for HMAC signature checks). |
| **Secrets at rest** | `helpers/app-store-encryption.js`: AES-256-GCM, `iv(12)‖tag(16)‖ciphertext` base64, key from env. `generateWebhookToken()` = 32 random bytes base64url. |
| **Background jobs** | toad-scheduler `CronJob`s in the primary process only. **There is no job queue**: webhooks are processed inline in the request, and "retry" means the next pull-sync tick. Meta rate-limit codes (4/17/32/613) pause polling for 30 min. |
| **Tests** | **None.** No runner, no fixtures, no CI. |

---

## 6. Leads module, end to end

### 6.1 Data model

```
organizations ─┬─< pipelines ─┬─< pipeline_stages
               │              ├─< pipeline_users >── users        (who can receive round-robin leads)
               │              └── last_assigned_user_id ── users  (round-robin cursor, row-locked)
               ├─< leads ──────┬── pipeline_id, stage_id, owner_id, form_id
               │               ├─< lead_stage_history
               │               ├─< lead_activities   (call/note/visit/email + next_follow_up_at)
               │               ├─< lead_notes
               │               └── custom_fields JSONB (GIN)
               ├─< custom_fields                       (field definitions)
               ├─< forms ─< form_fields >── custom_fields
               ├─< organization_apps ─┬─< organization_app_events     (integration log)
               │        │             └─< organization_app_leads_ref  (provider dedupe)
               │        └── app_id ── apps (global catalogue)
               ├─< external_lead_refs                  (dedupe for /leads/external-lead)
               ├─< followup_reminder_rules / logs
               └─< roles ─< role_module_permissions
facebook_oauth_bundles (short-lived, encrypted page list between OAuth callback and finalize)
round_robin_counters (older generic counter; superseded by pipelines.last_assigned_user_id)
```

| Table | Key columns | Indexes / constraints | Notes |
|---|---|---|---|
| `pipelines` | `id SERIAL`, `name`, `is_active`, `is_primary`, `entity_type ENUM(lead,deal)`, `reasons_for_unqualification JSONB[]`, `reasons_for_closed_lost JSONB[]`, `last_assigned_user_id`, `organization_id` | `organization_id` | "Primary" = default pipeline. `is_active` acts as archive. Delete is a hard delete. |
| `pipeline_stages` | `pipeline_id FK CASCADE`, `name`, `order INT`, `win_likelihood INT` (= probability), `description`, `stage_type ENUM(open,won,closed_unqualified,closed_lost)` | `pipeline_id`, `order`, `organization_id` | ⚠️ No colour column (colour is derived client-side in `lib/pipeline-stage-style.js`). ⚠️ No "required fields on entry". |
| `pipeline_users` | `pipeline_id`, `user_id`, `organization_id` | — | Round-robin pool. |
| `leads` | `id SERIAL`, `fullname`, `email`, `mobile_number`, `pipeline_id`, `stage_id`, `owner_id SET NULL`, `source`, `sub_source`, `form_id`, `remarks`, `state`, `city NOT NULL`, `is_converted`, `converted_at`, `converted_by`, `created_by/updated_by`, `created_via_type/name`, `updated_via_type/name`, `associated_entity_id`, `ai_*`, `custom_fields JSONB NOT NULL DEFAULT []`, `organization_id` | btree on email, mobile_number, pipeline_id, stage_id, owner_id, form_id, organization_id; **GIN on custom_fields** | ⚠️ `converted_at` is declared twice (DATE and STRING). ⚠️ The unique `(organization_id, mobile_number)` constraint was added and then dropped (`20260915000001/2`), so there is no DB-level dedupe. ⚠️ No soft delete. ⚠️ No tags column. |
| `lead_stage_history` | `lead_id CASCADE`, `from_stage_id`, `to_stage_id`, `changed_by`, `changed_at` | `lead_id`, `changed_at` | ⚠️ `changed_by` is typed `INTEGER` but references `users.id` (UUID). ⚠️ **Nothing writes to it**: `LeadStageHistoryModel.create` has no callers, so stage moves are not actually logged. |
| `lead_activities` | `lead_id`, `type STRING`, `description`, `next_follow_up_at`, `is_completed`, `reminder_rule_ids JSONB`, `created_by` | `lead_id`, `type`, `next_follow_up_at` | Follow-ups and reminders live here. |
| `lead_notes` | `lead_id`, `description`, `created_by` | `lead_id`, `created_by` | |
| `custom_fields` | `display_name`, `field_name`, `field_type ENUM(text,textarea,number,email,phone,date,datetime,time,select,multi_select,checkbox,radio,file,url)`, `options JSONB`, `is_filterable`, `description` | `field_type`, `organization_id` | ⚠️ No unique `(organization_id, field_name)`. |
| `forms` | `name`, `is_active`, `pipeline_id RESTRICT` | `name`, `pipeline_id` | ⚠️ `name` is **globally** unique, not per org. ⚠️ No target stage, public slug, spam settings, or layout/design. |
| `form_fields` | `form_id CASCADE`, `field_id → custom_fields CASCADE`, `section_name`, `is_required` | `form_id`, `field_id` | Layout = sections only. No field order column. |
| `apps` | `app_key`, `name`, `category`, `auth_type ENUM(webhook_push,api_key_pull,oauth)`, `config_schema JSONB` | — | Global catalogue, seeded. |
| `organization_apps` | `organization_id`, `app_id`, `status ENUM(active,error,disabled)`, `secrets_encrypted TEXT`, `webhook_token(64)`, `oauth_account_ref JSONB {page_id,page_name,form_id,form_name}`, `default_pipeline_id`, `default_stage_id`, `field_mapping JSONB`, `last_event_at`, `last_synced_at`, `last_error`, `installed_by` | — | One installation per org per app. |
| `organization_app_events` | `organization_app_id`, `direction ENUM(inbound,pull,test)`, `status ENUM(processed,ignored,error)`, `raw_payload JSONB`, `lead_id`, `error_message` | — | Integration log. ⚠️ `raw_payload` stores full lead PII indefinitely with no retention. |
| `organization_app_leads_ref` | `organization_app_id`, `provider_lead_id`, `lead_id` | — | Dedupe by provider id. |
| `external_lead_refs` | `organization_id`, `provider_lead_id`, `lead_id` | — | Dedupe for `/leads/external-lead`. |
| `facebook_oauth_bundles` | `id STRING`, `payload TEXT` (encrypted page list + page tokens) | — | Temporary hand-off from OAuth callback to finalize. |

**Custom field value storage:** values are denormalised **into `leads.custom_fields` as a JSONB array** of `{custom_field_id, field_id, field_name, field_label, field_type, section_name, is_required, value}`, with a GIN index. This is justified in the reference by "forms change, lead keeps a snapshot". Downsides: filtering by a typed value needs `@>` containment, there is no type safety, and renaming a field leaves stale labels. See the gap analysis for the dental decision.

### 6.2 API surface (all under `/v1`, authenticated tree gated by `requireModule("crm")`)

| Resource | Endpoints |
|---|---|
| Leads | `POST /leads` (multipart; `custom_fields` JSON), `PUT /leads/:id`, `GET /leads`, `GET /leads/:id`, `DELETE /leads/:id`, `POST /leads/assign-lead-owner` (bulk), `POST /leads/:id/convert-to-client`, `POST /leads/import-pipeline-stages`, `POST /leads/import-leads`, `POST /leads/import-lead-notes` |
| Pipelines | `POST /pipelines`, `PUT /pipelines/:id` (incl. stages), `POST /pipelines/:id/set-primary`, `POST /pipelines/:id/duplicate`, `GET /pipelines`, `GET /pipelines/:id`, `DELETE /pipelines/:id`, `POST/GET /pipelines/:pipeline_id/stages` |
| Stages | `PUT/GET/DELETE /pipeline-stages/:id` |
| Custom fields | CRUD `/custom-fields` |
| Forms | CRUD `/forms`, `GET /forms/:id/fields` |
| Form fields | CRUD `/form-fields`, `GET /form-fields/get-by-form-name/:form_name` |
| Activities | CRUD `/lead-activities`, `GET /lead-activities/get-by-lead/:id`, `GET /lead-activities/reminder-options` |
| Notes | CRUD `/lead-notes`, `GET /lead-notes/get-by-lead/:id` |
| Org apps | `GET /apps` (catalogue), `GET /organization-apps`, `GET/POST/PUT/DELETE /organization-apps/:app_key` (admin), `POST /:app_key/test`, `POST /:app_key/rotate`, `GET /:app_key/events`, Facebook: `GET /facebook_leads/oauth/start`, `/oauth/pages?bundle=`, `/oauth/forms?bundle=&page_id=`, `POST /oauth/finalize`, `POST /oauth/sync` |
| **Public** | `POST /leads/external-lead` (form submissions / external systems), `GET /organization-apps/facebook_leads/oauth/callback`, `POST /webhooks/apps/:app_key/:webhook_token`, `GET+POST /webhooks/apps/facebook-leads` |

### 6.3 Key flows

**Manual lead create** → controller validates with Zod → `LeadModel.create(req, tx, orgId)`. If no `owner_id` is given, `resolveRoundRobinOwner(pipelineId, orgId, tx)` row-locks the pipeline (`SELECT … FOR UPDATE`), rotates through `pipeline_users` ordered by id, and stores the cursor in `pipelines.last_assigned_user_id`. **This is a solid pattern; port it.**

**Stage move** → `PUT /leads/:id` with a new `stage_id` → update committed → if the new stage is `won`, create a downstream order; dispatch automation triggers `lead_marked_won` / `lead_marked_lost` / `lead_stage_changed` (fire-and-forget). ⚠️ No `lead_stage_history` row and no validation that the stage belongs to the lead's pipeline.

**Public form submission** (`POST /leads/external-lead`) → `resolveOrganizationIdForExternalLead(body)` (org from body `organization_id`, else a configured default) → optional `provider_lead_id` dedupe via `external_lead_refs` → `prepareLeadPayload` maps `custom_<formName>_<field_name>` keys to custom-field definitions → create lead. ⚠️ No captcha/honeypot, no per-route rate limit, tenant taken from the request body, and no embeddable widget or shareable hosted page.

**Integration framework (`lib/apps`)** — the part most worth porting:
* `registry.js`: `app_key → adapter`. Every adapter implements `{ verify(req, orgApp), normalizeLead(payload, orgApp), fetchSince?(orgApp, since) }` and returns a common normalised shape `{ name, phone, email, message, providerLeadId, createdTime?, raw, customFields? }`.
* `lead-ingest.js#createOrLinkLead(orgApp, normalized, {direction})`: dedupe on `(organization_app_id, provider_lead_id)` → require default pipeline/stage → create lead (Meta `created_time` overrides timestamps) → write ref → write an `organization_app_events` row → update `last_event_at`/`last_error`/`status`. **Never throws**: one bad payload can't break a webhook or a sync pass.
* Generic adapters: `custom-webhook` (admin-defined `field_mapping` resolved via `json-path-lite`), portal adapters (`_generic-portal-webhook` field-name guessing), `indiamart` (pull).
* Per-installation webhook: `POST /webhooks/apps/:app_key/:webhook_token`. The token is both tenant key and bearer secret, and is rotatable. Unknown token → 404; verification failure → 403; everything else → **200 even on error** (providers retry hard on non-2xx).

**Facebook Lead Ads** (`adapters/facebook-leads.js`, `api/organization-apps/*`, `cron-tasks/facebook-leads-pull-sync.js`):
1. `GET oauth/start` → Meta dialog URL with scopes `pages_show_list, pages_read_engagement, pages_manage_metadata, pages_manage_ads, leads_retrieval, business_management`.
2. Public `oauth/callback?code=` → exchange code for a user token → list pages via `/me/accounts` **and** a `/me/businesses` walk (skipped when app usage > 70%) → encrypt `{pages:[{id,name,pageAccessToken}]}` into a `facebook_oauth_bundles` row → redirect to `APP_URL/organization/apps/facebook-leads/select-page?bundle=…`.
3. Client page picker → `oauth/pages?bundle` → `oauth/forms?bundle&page_id` (`/{page}/leadgen_forms`).
4. `oauth/finalize` → `POST /{page}/subscribed_apps` (subscribe to `leadgen`) → upsert `organization_apps` with encrypted `page_access_token`, `oauth_account_ref`, default pipeline/stage → delete bundle.
5. **Webhook:** `GET /webhooks/apps/facebook-leads` does the `hub.mode/hub.verify_token/hub.challenge` handshake. `POST` checks `X-Hub-Signature-256` HMAC-SHA256 over `rawBody` with the app secret using `timingSafeEqual`, extracts `entry[].changes[].value{leadgen_id,page_id,form_id}`, finds the installation by `page_id`, `GET /{leadgen_id}` with the page token, flattens `field_data`, maps extra answers to custom fields via **normalised key matching** (`facebook-custom-fields.js`), then calls `createOrLinkLead`. Always answers 200.
6. **Pull-sync safety net** (cron, default every 5 min): `GET /{form_id}/leads?fields=id,created_time,field_data&limit=100` paginated, client-side `since` cutoff (Graph `filtering` was found to drop leads), first run looks back 24 h, provider-id dedupe makes overlap harmless. Rate-limit codes pause for 30 min.

⚠️ Facebook weaknesses to fix in the port:
* **No OAuth `state`.** `helpers/oauth-state.js` exists but is not used for Facebook, so the callback is CSRF-able. The `bundle` id is a bearer handle that is **not bound to the initiating org/user**, so any admin holding a bundle id could finalize it into their org.
* **No long-lived token exchange and no expiry tracking.** Page tokens derived from a short-lived user token expire. There is no `debug_token` check, no "token expires on" field, and no reconnect prompt; failures surface only as `last_error` text.
* Webhook processing is **synchronous** inside the request. There are no retries other than the next poll, and no dead-letter visibility beyond the events table.
* `raw_payload` keeps full PII forever.
* Dedupe is provider-id only. The same person arriving via Facebook and a web form produces two leads.

### 6.4 Client (dashboard) structure

```
src/
├── app/<route>/page.jsx        # thin server components: parse searchParams (nuqs cache), render a feature component inside PageContainer
├── app/api/*/route.js          # BFF auth handlers (httpOnly cookies)
├── features/<domain>/components/  # all UI for a domain: listing, form, create/edit pages, table/, kanban/
├── services/<domain>-service.js   # axios calls only (http() wrapper + endpoints.js)
├── hooks/use-<domain>.jsx         # TanStack Query hooks wrapping services, toasts + invalidation
├── schemas/                       # Zod schemas for forms
├── lib/                           # pure helpers (route-access, searchparams, build-custom-fields-schema, pipeline-stage-style…)
├── providers/                     # auth, protected-route, query-client, theme …
├── components/ui/                 # shadcn primitives (+ ui/table data-table kit)
├── components/{layout,forms,dialog,…}
├── config/, data/ (routes.js = sidebar + role map), utils/ (http.js, endpoints.js)
└── proxy.js                       # server-side route guard
```

Leads UI: `features/leads/components/*` (listing, `lead-view-toggle` list↔kanban, kanban via `@dnd-kit`, details, activity timeline, notes, assign-owner form, convert stepper), `features/pipelines`, `features/pipeline-stages`, `features/forms`, `features/custom-fields`, `features/organization-apps` (app store grid, install dialog, manage drawer, **field-mapper**, Facebook connect button + page selector). ⚠️ There is duplicated dead code: `features/leads/kanban/*` vs `features/leads/components/kanban/*`, and `features/leads/lead-header-actions.jsx` vs `components/lead-header-actions.jsx`.

---

## 7. What we will port vs. not port (summary — detail in 03/04)

**Port:** plugin-per-concern server bootstrap; Umzug migrations + idempotent DDL helpers; config module + `.env.example`; tenant-scoping helpers (applied to clinic/practice); typed `statusCode` errors + central handler; route-level `requireRole`/`requireModule` preHandlers; `lib/apps` adapter registry + never-throw `createOrLinkLead` + events log + provider-id refs; per-install webhook tokens; AES-GCM secret storage; Facebook webhook verification + pull-sync safety net + normalised custom-field key matching; round-robin with row lock; client `services → hooks → features → thin app pages` layering; httpOnly-cookie BFF auth; `proxy`/middleware route guard.

**Do not port (or fix while porting):** request-body logging on public routes; full-user JWT payload; 30-day access tokens; module-only permissions (we need action-level); in-process permission cache under cluster; stateless/unsound Facebook OAuth (missing `state`, unbound bundle); missing token-expiry tracking; synchronous webhook processing; unlogged stage history; globally unique form names; `INTEGER` FK to UUID; duplicated client folders; the in-memory `lead/service.js` stub; unredacted, unbounded `raw_payload` retention; the lack of tests.
