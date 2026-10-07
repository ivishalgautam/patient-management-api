# 02 — Dental Project: Current State

Audited 2026-10-07 on branch `revamp/leads-module`.

| Repo | Path | Base commit |
|---|---|---|
| API server | `D:\Vishal\drdipti\server` | `e93761b` |
| Dashboard | `D:\Vishal\drdipti\client\dashboard` | `e567e86` (plus one pre-existing uncommitted change in `src/components/forms/book-slot.js`, kept on this branch at the owner's request) |

The project root `D:\Vishal\drdipti` is **not** a git repo. Server and dashboard are versioned independently.

Severity tags used below: 🔴 critical (security or data loss), 🟠 bug (broken behaviour), 🟡 design debt.

---

## 1. Stack

| | Server | Dashboard |
|---|---|---|
| Runtime | Node ESM | Next.js 14.2 (App Router), React 18 |
| Framework | Fastify **4.18** (+ helmet, cors, rate-limit, multipart, static, view/EJS) | TanStack Query 4, nuqs 1, react-hook-form, Zod 3, Tailwind 4, shadcn/ui (Radix), recharts |
| Data | Sequelize 6 + PostgreSQL | — |
| Validation | Zod 3 (Joi installed but unused) | Zod |
| Jobs | toad-scheduler (1 cron job) | — |
| Messaging | Wafly WhatsApp API (`apps.wafly.in`) | — |
| Tests / CI | none | none |
| Lint | `next lint` script, but the server is not a Next app (no `.eslintrc`) | `next lint` + `.eslintrc.json`, prettier + tailwind plugin |

🟡 The server `package.json` describes a Next.js app (`next`, `react`, `react-dom` dependencies; `build`/`start` = `next build/start`; `next.config.mjs`; boilerplate Next README). In reality it is a plain Fastify server started with `nodemon index.js`. `models/index.js` is an unused CommonJS `sequelize-cli` stub that references a non-existent `config/config.json`.

---

## 2. Server structure

```
server/
├── index.js                  # creates fastify (pino-pretty, level debug), calls server(app), listen(PORT)
├── server.js                 # registers everything + an inline /v1/generate-backup route
├── backup.sql                # 🔴 tracked in git: pg_dump with users (incl. bcrypt hashes) and patients
├── models/index.js           # 🟡 dead sequelize-cli stub
├── views/credentials.ejs     # 🟡 unused (mailer is never called)
└── app/
    ├── config/index.js       # env → config; also hardcoded single-tenant IDs (CLINIC_ID, DOCTOR_ID, DOCTOR_USER_ID, PROCEDURE_ID)
    ├── db/
    │   ├── postgres.js       # Sequelize instance + plugin that calls models init (not awaited)
    │   ├── index.js          # loops models, await model.init()
    │   ├── models.js         # aggregator (28 models; OtpModel missing)
    │   └── models/*.model.js # schema + raw-SQL repository + sync({ alter: true })
    ├── routes/v1/index.js    # authenticated tree (onRequest verifyToken) + body logger
    ├── routes/v1/public.js   # unauthenticated: banners, procedures, services, patients/import, services/import
    ├── api/<module>/{routes,controller}.js   # 31 modules, no service layer
    ├── validation-schemas/*.schema.js
    ├── helpers/              # auth, error-handler, file, multer, mailer, interaktApi, slot, credential-generator, generateId, filter, cleanup-files
    ├── lib/{constants,encryption,middlewares/multipart-prehandler.js}
    ├── scheduler/appointment-cron.js
    ├── services/appointment-notification.service.js
    └── utils/{waffly.js, whatsapp-template.js, import-excel.js}
```

**Layering in practice:** `routes.js → controller.js → model functions (raw SQL)`. Controllers hold business rules, transactions, and orchestration of external calls. Model functions take the whole `req` and read `req.body`/`req.params` directly. Fake `req` objects are built to reuse them (e.g. `{ user_data: { id: config.doctor_user_id }, body: {...} }` in the patient import).

---

## 3. Roles and who uses what

| Role | How created | Uses |
|---|---|---|
| `admin` | DB / `POST /auth/register` | Platform owner: manage doctors, procedures, services (public catalogue), banners; global dashboard report |
| `doctor` | admin via `POST /users` (role=doctor) | Owns clinics (`clinics.doctor_id`), staff (`staffs.doctor_id`), slots, blocked slots, doctor-service mapping, patients, treatments, accounts. **Effectively the tenant.** |
| `staff` | doctor via `POST /users` (role=staff), mapped to the doctor (`staffs`) and to clinics (`clinic_staff_mappings`) | Appointments, clinic patients, patient clinical records |
| `patient` | doctor/staff/admin via `POST /users` (auto username `ddss<N>` + derived password), Excel import, or public register | Own bookings and payments (patient-facing app/website; that client is **not** in this repo). Login requires sending `role` in the body. |

The tenancy is implicit: **doctor (practice) → clinics (branches) → staff/patients via mapping tables**. Nothing on the server enforces it (see §7).

---

## 4. Feature inventory

| # | Feature | Server modules | Dashboard routes | Roles |
|---|---|---|---|---|
| 1 | Auth (login/register/refresh/username check/reset) | `auth`, `users` | `/` (login), `/admin`, `/register` | all |
| 2 | Users (doctors, staff, patients CRUD, status, password) | `users`, `staff`, `clinic-staff`, `doctor` | `/users`, `/users/create/[role]`, `/users/edit/[id]/[role]`, `/users/staff`, `/users/clinic-staff`, `/profile` | admin, doctor |
| 3 | Clinics + clinic switcher | `clinic`, `clinic-patient`, `clinic-staff` | `/clinics/*`, clinic-switcher | doctor |
| 4 | Catalogue: procedures → services (public site content, SEO meta) | `procedure`, `service`, `doctor-service`, `banner` | `/procedures/*`, `/services/*`, `/services/doctor/*`, `/banners/*` | admin, doctor |
| 5 | Scheduling: slot templates, blocked dates/slots | `slot`, `block-slot` | `/slots/*` | doctor |
| 6 | Appointments (bookings), status → completed auto-creates a treatment | `booking` | `/appointments`, `/appointments/create` | doctor, staff, patient |
| 7 | Patients + clinical record: comprehensive examination (tooth chart JSONB + gallery), notes, documents | `patients`, `clinic-patient`, `comprehensive-examination`, `note`, `document` | `/patients/[id]`, `/patients/[id]/{comprehensive-examination,notes,documents}`, `/clinic-patients` | doctor, staff |
| 8 | Treatments: treatment → plan (affected teeth, cost), prescriptions, visits, investigations (vitals), x-rays, history | `treatment`, `treatment-plan`, `treatment-prescription`, `treatment-visit`, `investigation`, `xray`, `treatment-history` | `/patients/[id]/treatments/details/{treatment-plan,prescription,visits,payment}` | doctor, staff |
| 9 | Billing: treatment payments (full/installment/advance; upi/cash/other), advance ledger, accounts summary | `treatment-payment`, `ledger` | `/patients/[id]/payment`, `/patients/[id]/ledgers`, `/accounts` | doctor, staff, patient (own) |
| 10 | Reports: today's appointments/patients/visits/collection | `report` | `/dashboard` | admin, doctor |
| 11 | WhatsApp notifications: booking confirmation (sync, during booking) + cron reminders 24 h/2 h before, follow-up 1 h after, review 2 h after | `booking`, `scheduler`, `services/appointment-notification`, `utils/waffly`, `utils/whatsapp-template` | — | system |
| 12 | Bulk import: patients + treatment history from Excel; services from Excel | `patients` (public!), `service` (public!) | — | (anyone) |
| 13 | File upload/serve/delete | `upload_files` (outside auth) | used by forms | (anyone) |
| 14 | DB backup | inline `GET /v1/generate-backup` (outside auth) | — | (anyone) |
| 15 | OTP (Interakt) | `otp` — **routes never registered; `OtpModel` not in aggregator** | `components/forms/otp.js` | dead |

### Module dependency graph (server)

```
users ─┬─ doctors ─┬─ clinics ─┬─ slots / blocked_slots
       │           │           ├─ bookings ──(completed)──▶ treatments
       │           │           ├─ clinic_patient_mappings
       │           │           ├─ clinic_staff_mappings ── staffs ── users
       │           │           └─ ledgers
       │           ├─ staffs
       │           ├─ doctor_service_mappings ── services ── procedures
       │           └─ doctor_patient_mappings
       └─ patients ─┬─ treatments ─┬─ treatment_plans, treatment_prescriptions, treatment_visits,
                    │              ├─ treatment_payments ──(advance_used)──▶ ledgers
                    │              ├─ investigations, xrays, treatment_histories
                    ├─ comprehensive_examinations, notes, documents
                    └─ bookings
patient_sequences (single row "patient" → next ddssN number)
```

---

## 5. Data model (as defined in code)

All PKs are `UUID DEFAULT uuidv4` (except `patient_sequences.id STRING`). All tables have `created_at/updated_at`. **No table has `deleted_at`, `created_by`/`updated_by` (except `added_by`/`created_by` on clinical rows), or a uniqueness constraint beyond the PK, `users.username`, `procedures.slug`, `services.slug`, and `slots.clinic_id`.**

| Table | Columns (beyond id/timestamps) | FKs (on delete) | Explicit indexes |
|---|---|---|---|
| users | fullname, country_code, mobile_number, email `''`, gender ENUM(male,female,other,''), dob STRING, username UNIQUE, password, is_active, role ENUM(admin,patient,doctor,staff), avatar, reset_password_token, confirmation_token | — | — |
| doctors | user_id, specialization, experience_years, about | users CASCADE | — |
| clinics | doctor_id, name, address, max_patients_per_slot | doctors CASCADE | — |
| staffs | doctor_id, user_id | doctors, users CASCADE | — |
| clinic_staff_mappings | clinic_id, staff_id | CASCADE | — (no unique pair) |
| patients | user_id, blood_group, marital_status ENUM, height_in_cm STRING, emergency_contact, **source** STRING | users CASCADE | — |
| clinic_patient_mappings | clinic_id, patient_id | CASCADE | — (no unique pair) |
| doctor_patient_mappings | doctor_id, patient_id | CASCADE | — |
| patient_sequences | id='patient', value INT | — | — |
| procedures | name, slug UNIQUE, is_featured, image, meta_* | — | — |
| services | procedure_id, name, image, slug UNIQUE, is_featured, main_points TEXT[], custom_points JSONB | procedures CASCADE | — |
| doctor_service_mappings | doctor_id, service_id | CASCADE | — |
| banners | url, is_featured, type ENUM(video,banner) | — | — |
| slots | doctor_id, clinic_id UNIQUE, start_time/end_time STRING, interval_in_minute, slots TEXT[], days_off INT[] | CASCADE | — |
| blocked_slots | clinic_id, type ENUM(date,slot), date DATEONLY, slots TEXT[] | CASCADE | — |
| bookings | doctor_id, patient_id, clinic_id, date DATEONLY, slot TIME, status ENUM(pending,canceled,completed), notification_24hr_sent, notification_2hr_sent, notification_1hr_after_sent, review_message_sent | CASCADE ×3 | — |
| treatments | clinic_id, patient_id, service_id, appointment_id, added_by, status ENUM(active,close) | CASCADE; appointment SET NULL; **added_by → users CASCADE** | — |
| treatment_plans | treatment_id, patient_id, affected_tooths JSONB, total_cost **INT**, notes JSONB, radiographic_diagnosis TEXT[], added_by | CASCADE (added_by too) | — |
| treatment_prescriptions | treatment_id, data JSONB, added_by | CASCADE | — |
| treatment_visits | treatment_id, visit_notes JSONB (default `0`), added_by | CASCADE | treatment_id, added_by |
| treatment_payments | treatment_id, payment_type ENUM, payment_method ENUM, amount_paid **INT**, advance_used INT, remarks, added_by | CASCADE | — |
| treatment_histories | treatment_id, content, files TEXT[], added_by | CASCADE | — |
| investigations | treatment_id, temperature, weight, blood_pressure, oxygen_saturation (all STRING), added_by | CASCADE | — |
| xrays | treatment_id, title, files TEXT[], added_by | CASCADE | — |
| comprehensive_examinations | patient_id, chief_complaint, medical_history, dental_history, examination, affected_tooths JSONB, gallery TEXT[], added_by | CASCADE | — |
| notes | patient_id, affected_tooths STRING, notes, added_by | CASCADE | — |
| documents | patient_id, title, documents TEXT[], added_by | CASCADE | — |
| ledgers | clinic_id, patient_id, service_id, reference_type ENUM(treatment_payment,treatment_plan,expense,refund,adjustment), entry_type ENUM(debit,credit), amount **INT**, description, created_by | CASCADE; service SET NULL | clinic_id, patient_id |
| otp (model only) | user_id, otp | — | never created (not in aggregator) |

**Schema drift in the live DB:** `backup.sql` contains tables that no current model defines: `appointments`, `dental_charts`, `dental_notes`, `prescriptions`, `models`. `sync({ alter: true })` never drops tables, so these legacy tables are still in production. The real production schema is therefore **not** reproducible from code. The Phase 3 baseline migration must be generated by introspecting a copy of the production DB, not from the model files.

---

## 6. Cross-cutting behaviour

| Concern | Current behaviour |
|---|---|
| **Response shape** | Mostly `{ status, data?, message? }`, but there are many deviations: `upload` returns a bare array; `users/me` returns the raw user object; `accounts` returns raw data; `importPatients` returns `{ success: true }`; typos (`mesage`); list payloads vary (`data.users` + `total`, `data.patients`, arrays, `total` at top level). |
| **Errors** | `helpers/error-handler.js`: Zod→400, Fastify validation→400, 401, 404, 429, everything else → 500 with `error.message` (leaks SQL/constraint text). No 403/409 handling; unique violations become 500. Controllers send ad-hoc codes (409 for "not found" in `treatment.create`). |
| **Validation** | Zod schemas exist for ~18 modules and are called with `.parse`, but **the parsed value is ignored** and models read raw `req.body`. Unknown fields pass through. Many modules have no schema (investigation, note, document, xray, visits, prescriptions, payment update, booking status, user update/status). No param/query validation (UUID format, pagination bounds). |
| **Auth** | JWT (`JWT_SECRET`, 30-day access) in `Authorization` header; refresh via `JWT_REFRESH_SECRET`. Token payload = full user row (bcrypt hash included). Client stores token, refresh token, and user in `localStorage`. |
| **Authorization** | No server-side role middleware. Only 6 ad-hoc `role ===` checks inside controllers, all for *data shaping*, not access control. The dashboard hides menu items by role on the client only. |
| **Tenancy** | None enforced: any authenticated user can read/update/delete any clinic, patient, treatment, payment, or ledger by id. |
| **Config** | `app/config/index.js` (dotenv). No `.env.example`. No boot validation. `pg_port` hardcoded `5432`. Several modules read `process.env` directly (mailer, interakt, rate limit). Hardcoded clinic phone `8882850066` in 8 places. Mail subject "Onlineparts.shop" (copied from another project). Dashboard `next.config.mjs` hardcodes a public IP and a devtunnel host. |
| **Logging** | Fastify logger at `debug` with pretty transport (even in production). `console.log` everywhere, including **every authenticated request body** (`routes/v1/index.js` preHandler: patient names, phones, medical notes, passwords on user create) and multipart field values. |
| **DB access** | Raw SQL with named replacements (good: parameterised). Schema managed by `sync({ alter: true })` on **every boot**, model by model, with errors swallowed per model. `postgres.js` does not await model init, so the server can accept requests before tables are synced. |
| **Transactions** | Opened in many controllers, but early `return`s skip `rollback()` (leaks pooled connections): booking.create, treatment.create, ledger.create, users.create, users.update, booking.updateById/updateStatus, treatment-payment.updateById… Some model functions accept `{ transaction }` but pass it in the wrong argument position (`UserModel.update`, `LedgerModel.create(req, transaction)`), so writes silently happen outside the transaction. |
| **Files** | Stored on local disk under `public/{images,videos,docs}`; served via `GET /v1/upload?file_path=`. Two divergent implementations (`helpers/file.js`, `helpers/multer.js`) with different MIME allow-lists. Multipart limit 5 GB. |
| **Background jobs** | One cron every 5 min scans **all** pending/completed bookings ever (unbounded) and sends WhatsApp messages inside 5-minute windows. If the process is down during a window, that message is never sent. Timezone is the implicit server-local TZ. Booking confirmation is sent synchronously **inside** the booking DB transaction. |
| **CORS / headers** | `origin: "*"`; helmet defaults; global rate limit from env. |

---

## 7. Defects found during the audit

### 🔴 Security
1. **Unauthenticated DB dump:** `GET /v1/generate-backup` (server.js) runs `pg_dump` into `server/backup.sql`, and anyone can call it.
2. **Patient data committed to git:** `backup.sql` is tracked (commit `59e2416`) and pushed to `origin`. It contains 14 users (with bcrypt hashes) and 9 patients. History rewrite plus credential rotation are needed, and that is the owner's decision.
3. **Arbitrary file read:** `GET /v1/upload?file_path=../../.env` resolves outside `public/` (`path.join(dir, "../../", file_path)`), with no auth.
4. **Arbitrary file delete:** `DELETE /v1/upload?file_path=…` → `fs.unlink(path.resolve(file_path))`, with no auth.
5. **Unauthenticated bulk writes:** `POST /v1/patients/import` and `POST /v1/services/import` are on the public router.
6. **Privilege escalation:** `POST /v1/auth/register` (public) accepts `role` from the body, so anyone can create an `admin`. `POST /v1/users` lets *any* logged-in user (including a patient) create admins/doctors.
7. **No authorization / IDOR everywhere:** no role checks or ownership/clinic scoping on any CRUD route (e.g. a patient token can `DELETE /v1/users/:id` or read any patient's treatments).
8. **Predictable patient credentials:** username `ddss<sequence>`, password = first 4 letters of name + last 4 digits of mobile (`credential-generator.js`, import).
9. **Secrets in tokens and browser storage:** JWT carries the full user row incl. password hash; tokens live in `localStorage` (XSS-exfiltratable).
10. **PII in logs:** request bodies logged on every authenticated request; Wafly responses and patient names logged by the cron.
11. **Missing-header crash path:** `verifyToken` sends 401 when `Authorization` is absent but does not `return`, then calls `.split` on `undefined`.

### 🟠 Functional bugs
12. `POST /auth/register` with role `patient` always throws: `patientNumber` is used before its `const` declaration (TDZ).
13. `POST /bookings` when the clinic is not found throws `ReferenceError: NOT_FOUND is not defined`.
14. `PUT /users/:id` with `password` updates **the caller's** password (`req.user_data.id`), not the target user's.
15. `POST /users/:id/change-password` can never succeed: `UserModel.getByPk` deletes `password` before `bcrypt.compareSync(old, undefined)`, which throws.
16. `DELETE /users/:id` on a missing user throws (null `dataValues`) instead of returning 404. The `record === 0` check is dead.
17. Deleting a user **cascades into clinical/billing records**: every `added_by`/`created_by → users ON DELETE CASCADE` means removing a staff member deletes the treatments, plans, payments, x-rays, notes… they authored.
18. Patient sequence race: read → +1 → write without a lock. Concurrent creates can produce duplicate `ddssN` usernames (unique violation → 500).
19. `importPatients` runs all rows concurrently on **one** transaction (`Promise.all`), and repeats the same 60-line treatment block three times.
20. `utils/waffly.js` references `config.waffly_template_24_hrs_before_appointment` (undefined key) and an undefined `error` variable. Only `sendBookingConfirm` from that file is used. Reminders use the newer `whatsapp-template.js` (duplicate implementation).
21. `GET /treatment-payments` (patient view) crashes if the caller has no patient row.
22. Booking `deleteById` exists in the controller but is not routed, and its messages say "Service".
23. Reset-password flow (`POST /auth/:token`) is dead: nothing ever sets `reset_password_token`.
24. Clinic, slot, booking, and payment updates have no ownership or state validation (e.g. editing a completed booking through `PUT /bookings/:id`).

### 🟡 Dead / duplicated code
`models/index.js`, `api/otp/*` + `otp.model.js` + `helpers/interaktApi.js`, `helpers/mailer.js` + `views/credentials.ejs`, `helpers/generateId.js`, `utils/waffly.js` (except one function), duplicate file helpers (`file.js` vs `multer.js`), Joi dependency, unused `next`/`react` dependencies on the server. Dashboard: `utils/api.js` (product/catalogue fetchers from another project), endpoints for non-existent APIs (`/dental-notes`, `/dental-charts`, `/clinics/add-patient`, `/auth/verify`), and route entries pointing at pages that don't exist (`/patients/[id]/treatment-plan`, `/reviews/create`, `/progress`).

---

## 8. Dashboard structure

```
src/
├── app/                      # pages contain data fetching + UI + table columns inline
│   ├── page.js (login), (auth)/register, admin, unauthorized
│   ├── dashboard, accounts, appointments, clinics, clinic-patients, patients/[id]/…, procedures, services, banners, slots, users, profile
├── components/
│   ├── forms/ (26 files, ~6k lines; each form does its own useMutation + http calls)
│   ├── ui/ (shadcn primitives + table kit), layout/, app-sidebar, nav-*, clinic-switcher, misc
├── store/                    # React contexts: MainContext (user via /users/me), ClinicContext (selected clinic in localStorage), ExaminationContext
├── server/                   # 🟡 misnamed: client-side fetch helpers (not server code), 12 files
├── hooks/                    # 7 ad-hoc hooks (fetch procedures/services/treatments, file handlers)
├── utils/                    # http.js (axios + refresh-on-401), header.js (localStorage token), endpoints.js, api.js (dead)
├── validation-schemas/       # Zod schemas per form
├── data/                     # routes.js (sidebar + role map), dental-chart, teeth-filter, days
└── lib/                      # cn(), Intl rupee, nuqs searchParams
```

* **Data access:** TanStack Query is used directly inside 91 page/form components, alongside `http()` calls; `src/server/*` only partially centralises them. There is no `services → hooks` layer and query keys are ad hoc.
* **Auth/route guard:** `components/layout/index.jsx` reads `localStorage.user` in a `useEffect` and redirects. There is no middleware, so protected pages render before the check runs. Role access is computed from `data/routes.js`.
* **State:** three React contexts; the selected clinic is persisted in `localStorage`.
* **Config:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_IMAGE_DOMAIN`; no `.env.example`.

---

## 9. Integrations & external services

| Service | Use | Config |
|---|---|---|
| Wafly (WhatsApp templates) | booking confirm, 24 h/2 h reminders, 1 h follow-up, review request | `WAFFLY_LICENSE`, `WAFFLY_API_KEY`, `WAFFLY_TEMPLATE_*` (sent as GET query params; API key ends up in URL/log lines) |
| Interakt (OTP) | dead | `INTERACT_API_KEY`, `INTERACT_TEMPLATE_NAME` (read directly from env, not in config) |
| SMTP | dead | `SMTP_*` |
| PostgreSQL `pg_dump` | backup endpoint | DB creds |

---

## 10. Things that must keep working (regression baseline for Phase 3)

1. Login per role (admin/doctor/staff/patient) and token refresh.
2. Doctor: create clinic, configure slots/blocked slots, map services.
3. Staff/doctor: create patient (auto credentials), book appointment (slot capacity check, blocked slots, WhatsApp confirm), complete appointment → treatment auto-created and patient mapped to clinic.
4. Treatment lifecycle: plan (teeth + cost), prescriptions, visits, investigations, x-rays/documents upload, notes, comprehensive examination with gallery.
5. Payments: full/installment/advance, remaining-balance guard, advance usage debited from ledger, accounts summary.
6. Reports for doctor (per clinic) and admin.
7. Cron reminders (24 h, 2 h, +1 h, +2 h review) firing once per booking.
8. Public catalogue endpoints (banners, procedures, services) used by the public website/patient app.
9. Excel import of patients/services (to be moved behind admin auth, not removed).

These become the characterization tests written **before** any file moves in Phase 3.
