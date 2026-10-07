# 04 — Target Structure

Conventions follow the reference ([01](01-reference-architecture.md)), renamed for the dental domain. **URL paths under `/v1` do not change** for existing endpoints. Only internal file locations move.

---

## 1. Server target tree

```
server/
├── index.js                        # bootstrap: validate config → connect DB → init models → build app → start queue workers → listen
├── app.js                          # buildApp(opts) — used by index.js and by tests (fastify.inject)
├── package.json                    # scripts: dev, start, lint, test, test:watch, migrate:{up,down,status,baseline}, seed:{up,down}, verify
├── .env.example
├── eslint.config.js  .prettierrc  vitest.config.js
├── README.md
├── docs/
│   ├── revamp/01…06-*.md
│   └── leads-module.md
├── scripts/
│   ├── migrate.js                  # Umzug up|down|status|baseline (down blocked in production)
│   ├── seed.js
│   └── backup.sh                   # ops-only replacement for /v1/generate-backup
├── migrations/
│   ├── _helpers/idempotent-ddl.js  # ported from ref
│   ├── _helpers/add-practice-id-column.js
│   └── 2026xxxxxxxxxx-*.js
├── seeders/
│   ├── *-system-roles-and-permissions.js
│   ├── *-default-lead-pipeline.js  # per practice; idempotent
│   └── *-integration-providers.js
├── test/
│   ├── setup/{db.js, app.js, factories.js, auth.js}
│   ├── characterization/           # Phase 3 safety net for existing flows
│   └── leads/                      # Phase 4/5
└── app/
    ├── config/index.js             # Zod-validated env → frozen config
    ├── plugins/                    # index.js (order), security, cors, cookie, rate-limit, multipart, static, raw-body, request-context, auth, queue, scheduler
    ├── routes/v1/{index.js, public.js}
    ├── middlewares/                # require-permission.js, require-role.js, require-feature.js, validate.js, multipart-prehandler.js
    ├── api/
    │   ├── auth/ users/ staff/ clinic-staff/ doctor/ clinic/ clinic-patient/ patient/
    │   ├── procedure/ service/ doctor-service/ banner/
    │   ├── slot/ block-slot/ booking/
    │   ├── treatment/ treatment-plan/ treatment-prescription/ treatment-visit/ treatment-history/
    │   ├── investigation/ xray/ document/ note/ comprehensive-examination/
    │   ├── treatment-payment/ ledger/ report/ upload-file/
    │   ├── role/ practice/ job/                         # new: roles & permissions, practice settings/features, failed jobs
    │   ├── lead/ lead-activity/ lead-note/ tag/         # new (Phase 4)
    │   ├── pipeline/ pipeline-stage/ custom-field/ form/ public-form/
    │   ├── integration/                                 # installations, OAuth, events, retry
    │   ├── lead-import/                                 # Phase 5 (CSV/Sheets)
    │   └── webhook/                                     # public inbound: facebook-leads, google-ads, custom
    │       └── each module: routes.js, controller.js, service.js (when it has logic)
    ├── db/
    │   ├── postgres.js  models.js  index.js
    │   └── models/*.model.js       # schema + repository functions with explicit args (no req), no sync()
    ├── validation-schema/*.schema.js
    ├── helpers/                    # auth-token.js, scope.js, oauth-state.js, secret-encryption.js, normalize-phone.js, pagination.js, credential-generator.js
    ├── lib/
    │   ├── constants/{index.js, permissions.js, lead.js}
    │   ├── encryption/
    │   ├── app-error.js
    │   ├── permissions.js          # role → permission keys (cached, invalidated on change)
    │   ├── lead-assignment.js      # round-robin with row lock (ported)
    │   ├── dedupe.js               # phone/email normalisation + match policy
    │   └── integrations/
    │       ├── provider.js         # LeadSourceProvider contract (JSDoc typedef + assertProvider())
    │       ├── registry.js         # key → provider; providers gated by practice_features
    │       ├── ingest.js           # ingestNormalizedLead(): dedupe → create/merge → refs → event (never throws)
    │       ├── field-mapping.js    # json-path-lite + custom-field key normalisation (ported)
    │       ├── redact.js           # PII masking for logs/events
    │       └── providers/{facebook-leads.js, google-ads-lead-form.js, sheet-import.js, custom-webhook.js, website-form.js}
    ├── services/
    │   ├── whatsapp/{wafly-client.js, templates.js}
    │   └── notifications/appointment-reminders.js
    ├── jobs/                       # pg-boss handlers: send-whatsapp, appointment-reminder, ingest-lead, fb-pull-sync, fb-token-check, lead-import, follow-up-reminder, purge-integration-payloads
    ├── cron-tasks/                 # schedules only (enqueue jobs)
    ├── logger/index.js             # pino options incl. redact
    ├── utils/{error-handler.js, file-storage.js, import-excel.js, response.js}
    └── views/
```

### Request lifecycle

```
plugin request-context (request_id) → auth hook (verify JWT → ctx.user, ctx.practiceId, ctx.clinicIds, ctx.permissions)
→ route preHandlers: requirePermission('x.y') → validate({ body, params, query })
→ controller(req.validated, req.ctx) → service(input, ctx) [transaction] → repository(args, { practiceId, transaction })
→ reply.ok(data, meta) | throw AppError → utils/error-handler.js
```

---

## 2. Server old → new path mapping

| Old | New | Notes |
|---|---|---|
| `server.js` | `app.js` + `app/plugins/*.js` | inline backup route deleted (G1.1) |
| `index.js` | `index.js` | awaits DB + models before listen |
| `models/index.js` | — | deleted |
| `next.config.mjs`, `jsconfig.json` | — | deleted |
| `backup.sql` | — | untracked + gitignored (history rewrite = owner decision) |
| `views/credentials.ejs` | — | deleted (unused) |
| `app/config/index.js` | `app/config/index.js` | Zod-validated; single-tenant IDs removed |
| `app/db/{postgres,index,models}.js` | same | `sync()` removed; init awaited |
| `app/db/models/*.model.js` | same names | repository functions take explicit args; `otp.model.js` deleted |
| `app/db/models/patient-sequence.model.js` | same (read-only one release) | replaced by `patient_number_seq` |
| `app/routes/v1/{index,public}.js` | same | imports move; patient/service import → authenticated tree |
| `app/api/patients/*` | `app/api/patient/*` | URL prefix stays `/patients` |
| `app/api/upload_files/*` | `app/api/upload-file/*` | URL stays `/v1/upload`; GET served by static plugin; DELETE authenticated |
| `app/api/otp/*` | — | deleted (never registered) |
| other `app/api/<m>/{routes,controller}.js` | same + new `service.js` | logic moved out of controllers |
| `app/validation-schemas/*.schema.js` | `app/validation-schema/*.schema.js` | + missing schemas |
| `app/helpers/auth.js` | `app/helpers/auth-token.js` + `app/plugins/auth.js` | slim claims, rotation |
| `app/helpers/error-handler.js` | `app/utils/error-handler.js` | ref-style + safe 500 |
| `app/helpers/file.js`, `app/helpers/multer.js`, `app/helpers/cleanup-files.js` | `app/utils/file-storage.js` | merged |
| `app/lib/middlewares/multipart-prehandler.js` | `app/middlewares/multipart-prehandler.js` | |
| `app/helpers/credential-generator.js` | same | random temp password |
| `app/helpers/slot.js`, `filter.js` | `app/lib/slot.js`, `app/lib/array.js` | |
| `app/helpers/{mailer,interaktApi,generateId}.js` | — | deleted |
| `app/scheduler/appointment-cron.js` | `app/cron-tasks/appointment-reminders.js` + `app/jobs/appointment-reminder.js` | |
| `app/services/appointment-notification.service.js` | `app/services/notifications/appointment-reminders.js` | |
| `app/utils/waffly.js`, `app/utils/whatsapp-template.js` | `app/services/whatsapp/{wafly-client,templates}.js` | merged |
| `app/utils/import-excel.js` | same | temp files in `os.tmpdir()`, random names |
| `app/lib/constants/index.js` | same + `permissions.js`, `lead.js` | |

## 3. Dashboard target tree (`client/dashboard/src`)

```
src/
├── middleware.js                   # server-side guard: auth cookie presence + public route list
├── app/
│   ├── layout.js  error.jsx  not-found.jsx
│   ├── api/{login,logout,refresh-token}/route.js     # BFF: httpOnly cookies (ported)
│   ├── (auth)/{page.js → login, admin, register}
│   ├── f/[slug]/page.jsx           # public hosted lead form (no dashboard chrome)
│   ├── dashboard, accounts, appointments, clinics, clinic-patients, patients/[id]/…, procedures, services, banners, slots, users, profile   # thin pages
│   ├── leads/{page.jsx, create, [id], [id]/edit}
│   ├── pipelines/{page.jsx, create, [id]/edit}
│   ├── forms/{page.jsx, create, [id]/edit, [id]/share}
│   ├── custom-fields/{page.jsx, create, [id]/edit}
│   └── settings/{roles, integrations, integrations/facebook-leads/select-page, integrations/[key]/logs, lead-imports, lead-imports/[id], jobs}
├── features/
│   ├── auth/ users/ staff/ clinics/ patients/ appointments/ slots/ procedures/ services/ banners/
│   ├── treatments/ (plan, prescription, visits, payment) examination/ notes/ documents/ ledgers/ accounts/ dashboard/
│   └── leads/ pipelines/ custom-fields/ forms/ integrations/ lead-imports/ roles/ jobs/
│       └── each: components/{*-listing.jsx, *-form.jsx, table/, …}
├── services/*-service.js           # axios calls only
├── hooks/use-*.jsx                 # TanStack Query hooks + query-key factories
├── schemas/*.js                    # Zod (was validation-schemas/)
├── providers/{query-client-provider, auth-provider, clinic-provider, examination-provider}.jsx
├── components/{ui/, layout/, shared/}   # shadcn + layout + generic (pagination, spinner, image-with-fallback, data-table)
├── lib/{utils.js, intl.js, searchparams.js, route-access.js, build-custom-fields-schema.js, pipeline-stage-style.js}
├── config/index.js
├── data/{routes.js, dental-chart.js, teeth-filter.js, days.js, lead-defaults.js}
└── utils/{http.js, endpoints.js}
```

## 4. Dashboard old → new path mapping

| Old | New |
|---|---|
| `components/QueryClientProvider.jsx` | `providers/query-client-provider.jsx` |
| `store/context.js` | `providers/auth-provider.jsx` (user from `/users/me` incl. permissions) |
| `store/clinic-context.js` | `providers/clinic-provider.jsx` |
| `store/examination-context.js` | `providers/examination-provider.jsx` |
| `components/layout/index.jsx` (client-side guard) | `middleware.js` + `components/layout/app-shell.jsx` (no guard logic) |
| `server/<x>.js` | `services/<x>-service.js` |
| `hooks/use-fetch-*.jsx` | `hooks/use-<domain>.jsx` |
| `utils/header.js` (localStorage token) | removed; cookies via BFF + rewrite proxy |
| `utils/api.js` | deleted |
| `utils/http.js`, `utils/endpoints.js` | same (http points to `/api/v1` proxy; dead endpoints removed) |
| `validation-schemas/<x>.js` | `schemas/<x>.js` |
| `components/forms/<x>.js` | `features/<domain>/components/<x>-form.jsx` (e.g. `forms/book-slot.js` → `features/appointments/components/book-slot-form.jsx`, `forms/payment.js` → `features/treatments/components/payment-form.jsx`) |
| `app/<route>/_component(s)/*` | `features/<domain>/components/*` |
| `components/{app-sidebar,nav-main,nav-user,clinic-switcher}.jsx` | `components/layout/*` |
| `components/{pagination,Spinner,image-with-fallback,thank-you}.jsx` | `components/shared/*` |
| `components/{accounts-reports,dental-notes-timeline,disease-badge-card}.jsx` | `features/{accounts,notes,examination}/components/*` |
| `lib/Intl.js` | `lib/intl.js` |
| `data/routes.js` | same; entries for non-existent pages removed; `roles` → `permission` keys |

## 5. New data model (Phase 4/5)

All new tables: `id UUID PK`, `practice_id UUID NOT NULL FK practices CASCADE`, `created_at`, `updated_at`, plus `created_by/updated_by UUID NULL FK users SET NULL` and `deleted_at` where noted.

| Table | Columns | Indexes / constraints |
|---|---|---|
| `practices` | name, owner_user_id, status ENUM(active,suspended), settings JSONB | |
| `practice_features` | practice_id, clinic_id NULL, feature_key (`leads`, `facebook_leads`, `google_leads`), enabled | unique (practice_id, clinic_id, feature_key) |
| `roles` | practice_id NULL (system), key, name, is_system | unique (practice_id, key) |
| `role_permissions` | role_id, permission_key | unique (role_id, permission_key) |
| `pipelines` | name, clinic_id NULL (NULL = practice-wide), is_default, archived_at, last_assigned_user_id, deleted_at | partial unique (practice_id) WHERE is_default AND archived_at IS NULL; idx (practice_id, clinic_id) |
| `pipeline_stages` | pipeline_id, name, position INT, color, probability INT 0–100, stage_type ENUM(open,won,lost), required_fields JSONB `[]`, archived_at | unique (pipeline_id, position) DEFERRABLE; idx pipeline_id |
| `pipeline_members` | pipeline_id, user_id | unique pair (round-robin pool) |
| `leads` | clinic_id NULL, pipeline_id, stage_id, owner_id NULL, full_name, phone, phone_normalized, email, email_normalized, source, sub_source, status ENUM(open,won,lost,converted), lost_reason, notes_summary, next_follow_up_at, form_id NULL, integration_id NULL, converted_patient_id NULL, converted_at, converted_by, last_activity_at, deleted_at | idx (practice_id, pipeline_id, stage_id) WHERE deleted_at IS NULL; (practice_id, owner_id, status); (practice_id, phone_normalized); (practice_id, email_normalized); (practice_id, next_follow_up_at); (practice_id, created_at DESC); trigram GIN on full_name for search |
| `lead_stage_history` | lead_id, from_stage_id, to_stage_id, changed_by, changed_at, duration_in_prev_stage_seconds | idx (lead_id, changed_at) |
| `lead_activities` | lead_id, type ENUM(note,call,whatsapp,email,meeting,follow_up,stage_change,assignment,created,updated,form_submission,integration,conversion), body TEXT, metadata JSONB, due_at NULL, completed_at NULL, created_by | idx (lead_id, created_at DESC); partial (practice_id, due_at) WHERE completed_at IS NULL |
| `tags` / `lead_tags` | name, color / lead_id, tag_id | unique (practice_id, lower(name)); PK (lead_id, tag_id) |
| `custom_fields` | entity ENUM(lead) (extensible), key, label, field_type ENUM(text,textarea,number,date,dropdown,multi_select,checkbox,phone,email,url), options JSONB, is_filterable, position, archived_at | unique (practice_id, entity, key) |
| `lead_custom_field_values` | lead_id, custom_field_id, value_text, value_number NUMERIC, value_date DATE, value_bool, value_json JSONB (multi-select) | unique (lead_id, custom_field_id); idx (custom_field_id, value_text), (custom_field_id, value_number), (custom_field_id, value_date); GIN value_json |
| `forms` | name, slug, pipeline_id, stage_id, clinic_id NULL, is_active, settings JSONB (thank-you text, redirect URL, theme, spam: {honeypot, min_seconds, turnstile}), assignment ENUM(round_robin,fixed,none), fixed_owner_id, deleted_at | unique (practice_id, name); unique slug (global, random suffix) |
| `form_fields` | form_id, source ENUM(core,custom), core_key NULL (full_name/phone/email/notes), custom_field_id NULL, label_override, placeholder, is_required, validation JSONB (min/max/pattern), section, position, width ENUM(full,half) | idx (form_id, position) |
| `form_submissions` | form_id, lead_id NULL, payload JSONB (snapshot), ip_hash, user_agent, status ENUM(accepted,duplicate,spam,error), error | idx (form_id, created_at) |
| `integrations` | clinic_id NULL, provider_key, status ENUM(active,error,disabled,needs_reauth), secrets_encrypted, webhook_token, account_ref JSONB (page/form ids), default_pipeline_id, default_stage_id, field_mapping JSONB, dedupe_policy ENUM(merge,create_flagged,skip), token_expires_at, last_event_at, last_synced_at, last_error, installed_by | unique (practice_id, provider_key, clinic_id); unique webhook_token |
| `integration_events` | integration_id, direction ENUM(inbound,pull,import,test,retry), status ENUM(queued,processed,duplicate,ignored,error), provider_lead_id, lead_id, payload_redacted JSONB, payload_encrypted TEXT (purged after 30 days), error_message, attempts | idx (integration_id, created_at DESC), (status) |
| `integration_lead_refs` | integration_id, provider_lead_id, lead_id | unique (integration_id, provider_lead_id) |
| `oauth_sessions` | practice_id, user_id, provider_key, payload_encrypted, expires_at | expires_at (purged) |
| `lead_imports` | integration_id NULL, source ENUM(csv,xlsx,google_sheet), file_path / sheet_ref, mapping JSONB, pipeline_id, stage_id, dedupe_policy, dry_run, status ENUM(pending,validating,ready,running,completed,failed), totals JSONB, error_report_path | idx (practice_id, created_at) |
| `lead_import_rows` | import_id, row_number, status ENUM(created,merged,skipped,error), lead_id, errors JSONB | idx import_id |
| existing `patients` | + `source_lead_id UUID NULL FK leads SET NULL` | |

**Integration provider contract** (`lib/integrations/provider.js`):

```js
/** @typedef {{ fullName?, phone?, email?, message?, providerLeadId, submittedAt?, customFields?: Record<key, value>, raw }} NormalizedLead */
// provider = {
//   key, displayName, feature,                 // feature gates via practice_features
//   kind: 'webhook' | 'oauth' | 'import',
//   verifyWebhook?(req, integration) → boolean,
//   parseWebhook?(req, integration) → NormalizedLead[] | { fetch: providerLeadId[] },
//   fetchLead?(integration, providerLeadId) → NormalizedLead,
//   fetchSince?(integration, since) → NormalizedLead[],
//   oauth?: { start(ctx), callback(ctx, query), finalize(ctx, input) },
//   checkCredentials?(integration) → { ok, expiresAt?, reason? },
// }
```

Every provider ends in the same `jobs/ingest-lead.js → lib/integrations/ingest.js#ingestNormalizedLead(integration, lead, { direction })`.

## 6. Migration order

Each migration has `up` and `down`. `down` is tested in CI on a fresh DB and on a restored production copy.

| # | Migration | Reversible notes |
|---|---|---|
| M000 | `baseline` — schema of the current production DB (from `pg_dump --schema-only` of a copy) | On existing DBs it is marked executed via `migrate:baseline`; `down` drops everything (blocked in production) |
| M001 | create `practices`; add nullable `practice_id` to doctors, clinics, staffs, users, patients, bookings, treatments (+ children via treatment), ledgers, slots, blocked_slots, notes, documents, comprehensive_examinations | down drops columns/table |
| M002 | backfill practices (one per doctor) and `practice_id` everywhere; writes a report of ambiguous patients (shared across doctors) and **aborts** if any are found unless `ALLOW_SHARED_PATIENT_SPLIT=assign_first` is set | down nulls columns |
| M003 | `practice_id` NOT NULL (except `users` for admin/patient-of-many) + indexes | down drops NOT NULL/indexes |
| M004 | `roles`, `role_permissions`, `users.role_id` + seed system roles/backfill from `users.role` | down drops |
| M005 | FK fixes: `added_by/created_by → RESTRICT` | down restores CASCADE |
| M006 | unique constraints on mapping tables (pre-check, abort with report on duplicates) | down drops constraints |
| M007 | soft-delete columns (`deleted_at`) on listed tables | down drops columns (data in them would be lost → down refuses if any `deleted_at IS NOT NULL` unless forced) |
| M008 | audit columns + missing indexes | down drops |
| M009 | `patient_number_seq` from `patient_sequences.value` | down drops sequence |
| M010 | `users.dob` STRING→DATE (copy to `dob_legacy`, parse, report unparseable) | down restores from `dob_legacy` |
| M011 | `clinics.contact_phone` (backfilled with the current hardcoded number) | down drops |
| M012 | pg-boss schema (`pgboss.*`, created via pg-boss `migrate`) | down drops schema |
| M020–M029 | leads core: practice_features, pipelines, pipeline_stages, pipeline_members, leads, lead_stage_history, lead_activities, tags/lead_tags, custom_fields, lead_custom_field_values, forms, form_fields, form_submissions, `patients.source_lead_id` | down drops in reverse order |
| M030–M033 | integrations, integration_events, integration_lead_refs, oauth_sessions | |
| M040–M041 | lead_imports, lead_import_rows | |
| S001… | seeds: system roles/permissions, default pipeline + stages + "Interest" custom field + sources per existing practice (idempotent), integration provider catalogue | `seed:down` removes seeded rows only if untouched |

Legacy tables (`appointments`, `dental_charts`, `dental_notes`, `prescriptions`, `models`) are **not dropped** in this revamp. A separate migration is proposed in 06 once you confirm they hold nothing needed.
