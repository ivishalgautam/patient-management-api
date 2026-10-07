# Leads module

Enquiries from walk-ins, calls, website forms, Facebook/Instagram Lead Ads and (add-on) Google Ads and spreadsheets, moved through pipelines until they become patients.

Everything is scoped to the **practice** (the doctor's account). A pipeline, form, integration or lead can optionally belong to one **clinic** (`clinic_id`; `NULL` = practice-wide).

---

## Data model

| Table | What it holds |
|---|---|
| `pipelines` | Named pipelines per practice; one `is_default` (non-archived) pipeline. `last_assigned_user_id` drives round-robin. |
| `pipeline_stages` | Ordered stages: `name`, `color`, `probability`, `stage_type` (`open` / `won` / `lost`), `required_fields` (core keys or `cf:<key>` that must be filled before a lead can enter). |
| `pipeline_members` | Team members who receive round-robin leads for a pipeline. |
| `leads` | The lead: name, phone (+ `phone_normalized`, E.164), email (+ `email_normalized`), pipeline/stage/owner, `status` (`open` / `won` / `lost` / `converted`), `source` / `sub_source`, `form_id` / `integration_id`, `duplicate_of_id`, `converted_patient_id`, `next_follow_up_at`, soft delete (`deleted_at`). |
| `lead_stage_history` | Every stage move with time spent in the previous stage. |
| `lead_activities` | Timeline: notes, calls, WhatsApp, emails, meetings, follow-ups (`due_at`, `completed_at`) and system entries (created, updated, stage change, assignment, form submission, integration, conversion). |
| `custom_fields` / `lead_custom_field_values` | Practice-defined fields (`text`, `textarea`, `number`, `date`, `dropdown`, `multi_select`, `checkbox`, `phone`, `email`, `url`), stored in typed columns so they can be filtered. |
| `tags` / `lead_tags` | Free tags. |
| `forms` / `form_fields` / `form_submissions` | Form builder, public slug, field layout, every submission (accepted / duplicate / spam / error). |
| `practice_features` | Add-on switches (`google_leads`) per practice, with optional per-clinic overrides. |
| `integrations` | Connected sources; `secrets_encrypted` (AES-256-GCM), `webhook_token`, `account_ref`, default pipeline/stage, `field_mapping`, `dedupe_policy`, status. |
| `integration_events` | Log of every delivery/pull: status, redacted payload, encrypted raw payload (purged after `INTEGRATION_PAYLOAD_RETENTION_DAYS`), error. |
| `integration_lead_refs` | Provider lead id → lead, so re-deliveries are recognised. |
| `oauth_sessions` | Short-lived Facebook connect hand-off (bound to practice + user). |
| `lead_imports` / `lead_import_rows` | Spreadsheet imports and their staged rows with a per-row outcome. Raw row data is cleared after the retention period. |
| `user_notifications` | In-app notifications (follow-up reminders), per user. Read ones are deleted after 90 days. |
| `roles` / `role_permissions` | Built-in roles (shared) and practice roles (`base_role = staff`). Users keep `users.role`; `users.role_id` picks the role whose permissions apply. |

Migrations: `20261008000100` (core), `000200` (default pipeline, stages, sources and an "Interested in" field per practice), `000300` (integrations), `000400` (lead imports), `20261009000100` (practice roles, notifications, follow-up reminders, `leads.view_all_clinics`). All are reversible (`npm run migrate:down <name>`).

### Duplicates

A lead matches an existing one when its normalised phone **or** email matches a non-deleted lead in the practice. Phones are parsed with libphonenumber using `DEFAULT_PHONE_REGION` for numbers without a country code; numbers that can't be parsed are stored as typed but not used for matching.

What happens on a match depends on where the lead comes from:

| Policy | Behaviour | Used by |
|---|---|---|
| `reject` | 409 with the matches; the user can confirm (`force: true`) | Manual create |
| `merge` | Adds a timeline entry to the existing **open** lead; creates a flagged lead if the match is closed | Forms, integrations (default) |
| `create_flagged` | Creates the lead with `duplicate_of_id` set | Optional |
| `skip` | Keeps the existing lead, creates nothing | Imports (default) |

### Assignment

`auto` (manual create): the chosen owner, else round-robin over the pipeline members, else the creator. Forms choose round-robin, a fixed person or nobody. Integrations and imports use round-robin (imports can also leave leads unassigned).

---

## Permissions

| Permission | Doctor | Staff |
|---|:-:|:-:|
| `leads.view` (own leads) / `leads.view_all` | ✓ | ✓ |
| `leads.view_all_clinics` | ✓ | |
| `leads.create`, `leads.edit`, `leads.convert` | ✓ | ✓ |
| `leads.delete`, `leads.assign`, `leads.import`, `leads.export` | ✓ | |
| `pipelines.manage`, `custom_fields.manage`, `forms.manage`, `integrations.manage` | ✓ | |

These are the built-in defaults. A practice can create its own roles in **Settings → Roles & permissions** (based on Staff, with any practice permission except role management), and assign staff members to them. Built-in roles are shared by every practice and can't be edited there. Permission changes apply immediately in the process that saved them and within 60 seconds elsewhere.

### Which leads someone sees

* Without `leads.view_all`, only leads they own.
* Without `leads.view_all_clinics`, only practice-wide leads (no clinic), leads of the clinics they work at (staff clinic mappings, or clinics they run as the doctor) and leads they own. They also can't create or move leads into another clinic.

The same rule applies everywhere a lead is read: list, kanban, detail, timeline, edits and moves, conversion, follow-ups, duplicate checks (a duplicate warning never names a lead the user can't see) and export.

Platform admins bypass permission checks. The route → permission map is `app/lib/permission-map.js` (a test fails when a route is missing); `PERMISSIONS_ENFORCE=false` logs denials instead of blocking, as an emergency switch.

---

## API

All under `/v1`, authenticated (Bearer token or the dashboard's session cookie), responses `{ status, data, message?, meta? }`.

| Area | Endpoints |
|---|---|
| Pipelines | `GET/POST /pipelines`, `GET/PUT/DELETE /pipelines/:id`, `POST /pipelines/:id/default`, `POST /pipelines/:id/archive` · `/unarchive`, `PUT /pipelines/:id/members`, `POST /pipelines/:id/stages`, `PUT /pipelines/:id/stages/reorder`, `PUT/DELETE /pipeline-stages/:id` |
| Custom fields & tags | `GET/POST /custom-fields`, `PUT /custom-fields/:id`, `POST /custom-fields/:id/archive` · `/unarchive`, `GET/POST /tags`, `DELETE /tags/:id` |
| Leads | `GET /leads` (filters: `pipeline_id`, `stage_id`, `owner_id`, `source`, `tag_id`, `status`, `clinic_id`, `created_from`/`created_to`, `q`, `cf[<key>]` for filterable custom fields, `follow_up` = overdue/today/upcoming/none; `sort`/`order`; `view=kanban` groups by stage; paginated), `POST /leads`, `GET/PUT/DELETE /leads/:id`, `POST /leads/:id/move`, `POST /leads/:id/assign`, `POST /leads/bulk` (assign, move, tag, untag, delete; up to 500 leads), `GET /leads/duplicates`, `GET /leads/follow-ups/due`, `GET /leads/owners`, `GET /leads/:id/timeline`, `POST /leads/:id/activities`, `PUT/DELETE /lead-activities/:id` |
| Conversion | `GET /leads/:id/convert/candidates` (patients with the same phone), `POST /leads/:id/convert` (link or create the patient, optionally book the first appointment, in one transaction) |
| Forms | `GET/POST /forms`, `GET/PUT/DELETE /forms/:id`, `GET /forms/:id/submissions` |
| Integrations | `GET /integrations/providers`, `GET/POST /integrations`, `GET/PUT/DELETE /integrations/:id`, `POST /integrations/:id/rotate-token` · `/sync` · `/check`, `GET /integrations/:id/events`, `POST /integrations/:id/events/:eventId/retry`, Facebook: `GET /integrations/facebook/oauth/start` · `/pages` · `/forms`, `POST /integrations/facebook/oauth/finalize` |
| Add-ons | `GET /practice-features`, `PUT /practice-features/:key` (`{ enabled, clinic_id?, reset? }`) |
| Imports | `GET /lead-imports`, `POST /lead-imports/upload` (multipart `file`), `POST /lead-imports/sheet` (`{ url }`), `GET /lead-imports/:id`, `GET /lead-imports/:id/rows`, `POST /lead-imports/:id/dry-run`, `POST /lead-imports/:id/start`, `POST /lead-imports/:id/cancel`, `GET /lead-imports/:id/errors.csv` |
| Export | `GET /leads/export` (same filters as the list; CSV with custom fields and tags; refuses above `LEAD_EXPORT_MAX_ROWS`) |
| Roles | `GET /roles`, `GET /roles/permissions` (catalogue), `GET /roles/members`, `GET /roles/mine` (any signed-in user: own role and permissions), `POST /roles` (`{ name, permissions? , copy_from? }`), `PUT/DELETE /roles/:id`, `PUT /roles/members/:userId` (`{ role_id }`, staff only) |
| Notifications | `GET /notifications` (`unread=true`, paginated; `meta.unread`), `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` — always the caller's own |
| Background jobs | `GET /jobs/failed`, `POST /jobs/:id/retry` |

**Public (no login):**

| Endpoint | Purpose |
|---|---|
| `GET /v1/public/forms/:slug` | Form definition + signed render token |
| `POST /v1/public/forms/:slug/submissions` | Submit a form |
| `GET/POST /v1/webhooks/facebook-leads` | Meta verification handshake / lead notifications |
| `POST /v1/webhooks/custom/:token` | Custom JSON webhook |
| `POST /v1/webhooks/google-ads/:token` | Google Ads lead form webhook (add-on) |
| `GET /v1/integrations/facebook/oauth/callback` | Facebook consent redirect |

---

## Forms

Build forms in **Leads → Forms**: core fields (name, phone, email, message) and custom fields, with section, width, order and required flags; choose the pipeline/stage, assignment and thank-you message. Each form has a share link (`<APP_URL>/f/<slug>`) and an iframe embed code.

Spam protection on submissions:

* hidden honeypot field;
* signed render token (HMAC with `FORM_TOKEN_SECRET`) with a minimum fill time and 24 h expiry;
* 10 submissions per minute per visitor and form, on top of the global rate limit;
* optional Cloudflare Turnstile per form when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set;
* values are trimmed, length-limited and validated against the field type; HTML is never rendered back.

Rejected submissions are stored with status `spam` and create no lead.

---

## Integrations

All sources run through the same path: delivery → `integration_events` (redacted copy + encrypted raw payload) → `integrations.process` job → field mapping → dedupe → lead. Failures retry with backoff; events can be retried from the integration page and dead jobs from **Settings → Failed jobs**.

`INTEGRATION_ENCRYPTION_KEY` must be set (`openssl rand -base64 32`); without it providers show "Not configured on the server yet" and connecting returns 503.

### Field mapping

Answers whose key looks like a name, phone or email are recognised automatically (`full_name`, `first_name`/`last_name`, `phone_number`, `mobile`, `email`, …). Keys matching a custom field key fill that field. Anything else can be mapped on the integration page (`<answer key>` → core field, `cf:<key>` or ignore); unmapped answers are appended to the lead's notes so nothing is lost. Values that don't fit a custom field (e.g. an unknown dropdown option) are kept in notes and logged as warnings.

### Facebook & Instagram Lead Ads

1. In [Meta for Developers](https://developers.facebook.com/), create a **Business** app and add **Facebook Login for Business** and **Webhooks**.
2. Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, a random `FACEBOOK_WEBHOOK_VERIFY_TOKEN` and `API_URL` (public HTTPS URL of the API including `/v1`).
3. Valid OAuth redirect URI: `<API_URL>/integrations/facebook/oauth/callback`.
4. Webhooks → **Page** → callback URL `<API_URL>/webhooks/facebook-leads`, verify token = `FACEBOOK_WEBHOOK_VERIFY_TOKEN`; subscribe to the `leadgen` field.
5. Permissions requested: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval`, `business_management`. In development mode only app roles can connect; production needs **Advanced Access** (business verification + app review).
6. In the dashboard: **Settings → Lead integrations → Connect Facebook**, pick the page and forms, the pipeline/stage and any field mapping.
7. Test with Meta's [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing).

Webhook deliveries are verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret); bad signatures are dropped. A pull sync (`FB_PULL_SYNC_CRON`, default every 10 minutes) fetches recent leads in case a webhook was missed. A daily job checks the page token; when it expires or is revoked the integration shows **Reconnect needed**.

### Custom webhook

**Create webhook** gives a private URL `<API_URL>/webhooks/custom/<token>` that accepts any JSON. Without path mappings top-level keys are used as answers; path mappings (`$.contact.phone` → `phone`) handle nested payloads. The token is the credential: rotate it from the integration page if it leaks.

### Google leads add-on

Switch it on in **Settings → Add-ons** (whole practice, or per clinic). When off, the Google providers are hidden, imports are refused and the Google webhook answers 404.

**Google Ads lead form webhook**

1. **Settings → Lead integrations → Google Ads lead forms → Create webhook**: choose a name, pipeline/stage and a key (at least 8 characters).
2. In Google Ads, open the lead form asset → **Lead delivery → Webhook integration**: paste the webhook URL (`<API_URL>/webhooks/google-ads/<token>`) and the same key.
3. Click **Send test data**. The test shows in the integration's event log as *ignored — the connection works*; turn on "Add Google test leads as real leads" if you want them in the pipeline.

The key is stored encrypted and compared in constant time; a wrong key gets 403 and is logged without the payload. `user_column_data` standard columns (`FULL_NAME`, `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `PHONE_NUMBER`, falling back to `WORK_EMAIL`/`WORK_PHONE`) map to core fields; custom questions arrive under their question text and can be mapped like any other answer. `lead_id` dedupes re-deliveries. The key can be changed on the integration page (update Google Ads at the same time).

**Spreadsheet import**

**Settings → Import leads**:

1. Upload a CSV/XLSX file, or paste the link of a Google Sheet shared as "Anyone with the link can view" (only `docs.google.com` links are fetched; the tab in the link is imported as CSV).
2. Match each column to a core field, a custom field or "Don't import" (guessed from the headings). Multi-select values can be separated with `,` `;` or `|`.
3. Choose pipeline/stage, clinic, what to do with existing phone/email (skip, add to the open lead, or create flagged), owner assignment and the lead source label.
4. **Check rows** (dry run) shows how many leads would be created, merged, skipped and which rows have problems, without writing anything.
5. **Import** queues a `leads.import` job that processes rows in batches, each in its own transaction, and shows progress. Re-running the job only processes rows still pending.
6. Afterwards, browse rows by outcome and download **Problem rows (CSV)** with the original columns (cells are escaped so spreadsheet apps don't run them as formulas). Past imports are listed under **History**.

Limits: `LEAD_IMPORT_MAX_ROWS` (default 5000) rows per import, `LEAD_IMPORT_SHEET_MAX_MB` (default 10) per sheet download, `MAX_UPLOAD_MB` per uploaded file.

---

## Follow-up reminders and notifications

A follow-up (timeline entry with a due date) triggers one in-app notification to the lead's owner, or to whoever added it when the lead has no owner, `LEAD_FOLLOW_UP_REMIND_MINUTES` before it is due. It shows in the bell in the dashboard header and links to the lead. Completed follow-ups and closed leads are skipped; changing the due time re-arms the reminder; follow-ups more than a day overdue are not reminded (so a deploy or downtime doesn't flood anyone). There is no WhatsApp/email reminder to staff yet: Wafly templates are only set up for patients.

## Export

**Export** on the leads page downloads the leads matching the current filters (all stages on the kanban) as CSV: core fields, pipeline/stage/owner/clinic, tags, follow-up and activity dates, notes and one column per custom field. Cells are escaped against spreadsheet formulas and the file starts with a UTF-8 BOM so Excel shows non-Latin names correctly. Needs `leads.export` (doctors by default); the log records who exported how many rows, never the data.

## Background jobs (pg-boss)

| Queue | What it does | Retries |
|---|---|---|
| `integrations.process` | Turns a stored delivery into a lead | 5, backoff from 30 s |
| `integrations.fb-pull-sync` | Facebook safety-net sync (`FB_PULL_SYNC_CRON`) | — |
| `integrations.fb-token-check` | Daily token expiry check (03:00) | 1 |
| `integrations.purge-payloads` | Clears raw payloads and import rows older than the retention period (03:30) | 1 |
| `leads.import` | Runs a spreadsheet import | 3, backoff from 60 s |
| `leads.follow-up-reminders` | Notifies lead owners of follow-ups coming due (`LEAD_FOLLOW_UP_REMINDER_CRON`, every 5 min) | — |

Jobs live in the `pgboss` schema of the application database. Failed jobs (after all retries) are listed in **Settings → Failed jobs** with a retry button, filtered to the caller's practice.

---

## Privacy and logging

* Request bodies are never logged; pino redacts auth headers, cookies, passwords and tokens.
* Integration logs store a **redacted** payload (phones/emails masked, names truncated, free text and keys/tokens removed). The full payload is stored encrypted only for replay and is cleared after `INTEGRATION_PAYLOAD_RETENTION_DAYS`.
* Integration secrets (Facebook page tokens, Google keys) are encrypted with `INTEGRATION_ENCRYPTION_KEY` and never returned by the API.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DEFAULT_PHONE_REGION` | `IN` | Region for numbers without a country code |
| `APP_URL` | `http://localhost:3000` | Dashboard URL for form links/embeds and OAuth redirects back |
| `API_URL` | `http://localhost:<PORT>/v1` | Public API URL shown in webhook URLs |
| `FORM_TOKEN_SECRET` | derived from `JWT_SECRET` | Form render-token signing key |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | empty | Optional Turnstile on forms |
| `INTEGRATION_ENCRYPTION_KEY` | — (required for integrations) | 32-byte base64 key |
| `INTEGRATION_PAYLOAD_RETENTION_DAYS` | `30` | Raw payload / import row retention |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | empty | Facebook Lead Ads |
| `FACEBOOK_GRAPH_API_VERSION` | `v23.0` | Graph API version |
| `FB_PULL_SYNC_CRON` | `*/10 * * * *` | Facebook pull-sync schedule |
| `LEAD_EXPORT_MAX_ROWS` | `10000` | Rows per CSV export |
| `LEAD_FOLLOW_UP_REMIND_MINUTES` | `15` | Remind this long before a follow-up is due |
| `LEAD_FOLLOW_UP_REMINDER_CRON` | `*/5 * * * *` | How often reminders are checked |
| `LEAD_IMPORT_MAX_ROWS` | `5000` | Rows per import |
| `LEAD_IMPORT_SHEET_MAX_MB` | `10` | Google Sheet download limit |

## Tests

`test/leads/` covers configuration (pipelines, stages, custom fields), leads (CRUD, moves, required fields, assignment, dedupe, filters, permissions), forms (validation, spam protection, rate limit, tenant isolation), integrations (Facebook OAuth, signature, fetch, mapping, pull sync, token checks, custom webhook), conversion, the Google add-on (switches, Google webhook, imports) and access (practice roles, clinic-scoped visibility, export, follow-up reminders and notifications). Run with `npm test`.
