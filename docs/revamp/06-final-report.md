# 06 — Final Report

Revamp of the Dr. Dipti dental platform using the BW Task source as a reference (patterns adapted, not copied), plus the new Leads module and the Google Leads add-on.

* **Repositories:** `server/` and `client/dashboard/` (separate git repos).
* **Branch:** `revamp/leads-module` in both, tagged `revamp-phase3`, `revamp-phase4` and `revamp-phase5` after each phase. Security fixes were also made on `hotfix/security` (both repos) and merged into the revamp branch.
* **Reference project** (`bw-task-full-source`) was read-only and is unchanged.
* **Not committed on purpose:** your earlier uncommitted change in `client/dashboard/src/components/forms/book-slot.js` is still uncommitted in the working tree.

---

## 1. Definition of done

| Requirement | Status | Evidence |
|---|---|---|
| Build passes | ✅ | `next build` compiles (dashboard); server boots via `buildApp` in every test run |
| Lint passes | ✅ | `npm run lint` (server): 0 problems. `next lint` (dashboard): 0 errors, 4 warnings, all in files the revamp didn't touch |
| Tests pass | ✅ | Server **368 tests / 19 files**, dashboard **7 tests / 4 files** |
| Tests for pipelines, stages, forms, custom fields, ingestion (Facebook + Google), dedupe, permissions | ✅ | `test/leads/{config,leads,forms,integrations,conversion,google-addon}.test.js`, `test/platform/permissions.test.js` |
| Migrations up/down on a fresh DB | ✅ | Empty DB: up (11) → down to 0 (11 reverted, only the migration-tracking table left) → up (11) |
| Migrations up/down on a copy of existing data | ✅ | Fresh `pg_dump` of the local `drdipti` DB: baseline → up (10) → down to the first revamp migration (10 reverted) → up (10). Row counts unchanged at each step (503 users, 499 patients, 623 bookings, 1349 treatments, 1 clinic) |
| Existing dental features keep working | ✅ | `test/characterization` pins auth, users, patients, bookings, treatments, billing, uploads and imports. Response shapes are frozen. Changes in behaviour are only the listed bug fixes |
| Every schema change has a reversible migration | ✅ | 10 migrations after the baseline, each with a tested `down` |
| No hardcoded secrets; everything in `.env.example` | ✅ | Config is validated with zod. A script check confirms every config variable and every `process.env` read appears in `.env.example` (server and dashboard) |
| Docs | ✅ | Both READMEs rewritten; `docs/leads-module.md`; this report |

The migration checks ran on throwaway databases (`drdipti_verify_*`, since dropped). The local `drdipti` database was only read by `pg_dump`. **The real production database has not been touched;** see the deploy steps in §6.

---

## 2. What was done, by phase

### Phase 1–2: audit and plan
`01-reference-architecture.md`, `02-dental-current-state.md` (30 defects, 11 of them security issues), `03-gap-analysis.md`, `04-target-structure.md`, `05-implementation-plan.md`. You approved the plan with the defaults for Q1–Q9.

### Security hotfix (`hotfix/security`, merged)
Removed the unauthenticated DB dump endpoint. Confined upload reads to `public/` and required auth for upload/delete. Put both imports behind auth. Limited self-registration to patients and limited which roles each caller can create. Fixed the `verifyToken` missing `return`. Stopped logging request bodies (including login and multipart fields). Untracked `backup.sql`. Dashboard delete calls now send the token.

### Phase 3: restructure and standardise (server + dashboard)
* **Server:** app factory with one plugin per concern; zod-validated config; Umzug migrations with a production baseline (no `sync()` at boot); practices as tenants with a route-level tenant map; action-level RBAC with a permission map; slim JWTs with revocation (`token_version`) and refresh rotation; httpOnly cookie support; a central `AppError` and error handler (500s never leak internals); request ids and pino redaction; transaction helpers so a transaction can't leak; a DB-hardening migration (FKs no longer cascade-delete clinical records, soft deletes for payments/ledgers, unique constraints, indexes, a patient-number sequence); a pg-boss queue for WhatsApp and reminders with retries and a failed-job API; dead code removed.
* **Dashboard:** cookie sessions through Next route handlers and an `/api/v1` proxy (no tokens in `localStorage`), server-side route guard (`middleware.js`), folders reorganised into `features/ services/ hooks/ providers/ schemas/`, error boundary and not-found page, and generated patient credentials shown once.
* **Characterization tests** written before each refactor.

### Phase 4: Leads core
Pipelines and stages (reorder, default, archive, required fields, round-robin team), custom fields (typed values, filterable), tags, leads (CRUD, dedupe, move with stage history, assign, bulk, filters, kanban, timeline, follow-ups), forms (builder, public page and embed, spam protection), the integration framework (events log, redaction, encrypted payloads, retries), Facebook Lead Ads (OAuth, page/form picker, signed webhooks, pull sync, token health), and lead → patient conversion with an optional first booking. Plus the full dashboard UI for all of it.

### Phase 5: Google Leads add-on
Per-practice and per-clinic add-on switches. Google Ads lead form webhook (per-integration URL and `google_key`, constant-time check, column mapping, test-lead handling, key rotation). Spreadsheet import: CSV/XLSX upload or a shared Google Sheet, column matching, dry run, dedupe policy, a background job that can resume, per-row results, a problem-rows CSV, and history. Dashboard: Add-ons page, import wizard, and Google settings on the integration page.

### Phase 6: docs and verification
READMEs for both repos, `docs/leads-module.md` (data model, API, Facebook and Google setup step by step, jobs, env), final `.env.example`, and this report. Full verification as in §1.

---

## 3. Cross-cutting requirements

| Requirement | Implementation |
|---|---|
| Permissions per Leads action | `leads.view / view_all / create / edit / delete / assign / import / export / convert`, `pipelines.manage`, `custom_fields.manage`, `forms.manage`, `integrations.manage`. Every route is in `permission-map.js`, and a test fails if one is missing |
| Webhook signature verification | Facebook `X-Hub-Signature-256` over the raw body; Google `google_key` constant-time compare; custom webhook uses an unguessable URL token that can be rotated |
| Rate limiting | Global limit, plus 10/min per visitor per form on public submissions. Facebook webhook is exempt (Meta retries) |
| Sanitisation | zod on every input; form values trimmed, length-limited and type-checked; CSV error reports escape formula cells |
| PII-safe logging | No request bodies in logs; pino redaction; integration logs keep only redacted payloads in plain form; raw payloads are encrypted and purged after 30 days; import rows purged the same way |
| Indexes | Leads by practice/pipeline/stage/owner/status, normalised phone/email, trigram on name, follow-up dates, events by integration, imports by practice |
| Pagination | Leads, events, imports, import rows, form submissions and failed jobs return `meta: { page, limit, total }` |
| Background jobs | pg-boss: WhatsApp, reminders, integration processing, Facebook sync and token checks, purge, lead imports |
| Integration logs | `integration_events` per delivery/pull with status, error and retry |
| Failed-job retry | Settings → Failed jobs (`GET /jobs/failed`, `POST /jobs/:id/retry`), scoped to the practice |
| Seed data | Migration `20261008000200` seeds a default pipeline ("New Patient Enquiries", 6 dental stages), sources and the "Interested in" / "Preferred time to call" fields for every practice; new practices get them on first use |

---

## 4. Audit defects (from `02` §7)

| # | Defect | Status |
|---|---|---|
| 1, 3, 4, 5, 6, 10, 11 | Unauthenticated dump, file read/delete, public imports, privilege escalation, PII in logs, missing `return` | ✅ Fixed (hotfix) |
| 2 | `backup.sql` in git history | ⚠️ Untracked and ignored. **History rewrite and credential rotation are still yours to do** (Q2) |
| 7 | No authorization / IDOR | ✅ Tenant map + permission map on every route |
| 8 | Predictable patient passwords | ✅ Random by default, shown once. `PATIENT_PASSWORD_MODE=legacy` restores the old scheme if needed |
| 9 | Password hash in tokens, tokens in `localStorage` | ✅ Slim tokens; dashboard uses httpOnly cookies |
| 12, 13, 15, 16, 21, 25, 26, 27, 28 | Functional bugs | ✅ Fixed, most with a characterization test |
| 14 | — | Not a bug (corrected in the audit doc) |
| 17 | Deleting a user cascades into clinical records | ✅ FKs changed to NO ACTION; users are soft-deleted |
| 18 | Patient number race | ✅ DB sequence |
| 19 | Import shares one transaction concurrently | ✅ Rewritten as a sequential service |
| 20 | Broken duplicate WhatsApp helper | ✅ Removed |
| 22, 23, 29 | Dead routes / handlers (booking delete not routed, reset-password flow never armed, `GET /users/staff`) | ⏸ Left as they were: no client uses them, and there's no agreed behaviour to restore |
| 24 | No state validation on clinic/slot/booking/payment updates | ◑ Ownership is enforced (tenancy); business-state rules (e.g. editing a completed booking) are not |
| 30 | Advance used doesn't reduce the remaining balance | ❓ **Needs your confirmation** of the intended billing rule; unchanged |

---

## 5. Deliberate deviations and things not done

**Deviations from the plan or the reference (intentional):**
1. Thin CRUD modules were not rewritten into the reference's explicit-argument repositories. They are wrapped by the tenant/permission guards and the error handler instead. New code (bookings, imports, leads) uses services.
2. Existing response shapes are frozen (Q3): new fields were added, none renamed. The `{ status, data }` envelope is used for new endpoints.
3. `dob` stays a string, money stays integer rupees, and the legacy `dental_notes` table is untouched (outside the baseline).
4. Existing dashboard components keep their inline queries. Only new screens use the `services → hooks` layer.
5. Google test leads (`is_test`) are **logged but not created** by default (the plan said "ingest with a test tag"). This keeps fake leads out of pipelines and still proves the setup works. A per-integration switch adds them as real leads.
6. Private Google Sheets via OAuth are not implemented; sheets must be shared by link (as planned for v1, assumption A2). There is no `GOOGLE_SHEETS_OAUTH_ENABLED` flag.
7. `ACCESS_TOKEN_TTL` defaults to `1d` (not 15 m) so older clients that don't refresh on 401 keep working. Shorten it once every client refreshes.

**From the plan, not built (follow-ups):**
1. **Roles & permissions editing screen/API.** Roles and permissions exist and are enforced with system defaults (doctor, staff, patient, admin), but practices can't edit them yet.
2. **Lead follow-up reminder job.** Follow-ups are stored, shown on the lead and filterable (`follow_up=overdue|today|…`, `GET /leads/follow-ups/due`), but nobody is notified.
3. **Clinic-scoped lead visibility for staff** (assumption A4). Visibility is owner-based: `leads.view` sees own leads, `leads.view_all` sees the whole practice. Staff mapped to one clinic who hold `view_all` (the default) also see other clinics' leads.
4. Lead **export** (`leads.export` permission exists; no endpoint yet).

---

## 6. Deploying

1. **Hotfix first (recommended now):** merge `hotfix/security` into `master` in both repos and deploy. It's independent of the revamp.
2. **Back up the production DB.**
3. Server env: add the new variables from `.env.example`. Required: `INTEGRATION_ENCRYPTION_KEY` for integrations, `APP_URL` and `API_URL` (public URLs), `ALLOWED_ORIGINS`. Set `LEGACY_TOKEN_GRACE_UNTIL` to a date about two weeks out so signed-in users aren't logged out. Optional: Facebook, Turnstile and import limits.
4. On the production DB, once: `npm run migrate:baseline`, then `npm run migrate:up`. Rehearse on a restored copy first: Q5 asked for a production copy, and these checks used the local DB instead.
5. Dashboard env: `API_URL` **before** `next build` (it's baked into the proxy), plus `NEXT_PUBLIC_IMAGE_DOMAIN`.
6. Facebook / Google: follow `docs/leads-module.md`.
7. Rollback: redeploy the previous build. Revamp migrations can be reverted with `npm run migrate:down 20261007000100-add-users-token-version.js` (keeps the baseline and all data, as verified on the copy). Two emergency switches exist: `PERMISSIONS_ENFORCE=false` (log instead of block) and `REMINDERS_ENGINE=legacy`.

---

## 7. Open questions for you

1. **Billing (#30):** should an advance used on a payment reduce the treatment's remaining balance?
2. **`backup.sql` history (#2):** rewrite git history and rotate the leaked credentials?
3. **Self-registration with several practices:** registration now needs a `clinic_id` when more than one practice exists. Does the patient app send one?
4. **Follow-ups (§5):** which of the four "not built" items do you want next?
