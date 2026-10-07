"use strict";
// Practice (tenant) scoping for every authenticated route, in one place.
//
// Value per "METHOD /path":
//   [[resource, source], ...]  each id found at `source` (params.x, body.x,
//                              query.x) must belong to the caller's practice
//                              (and to the caller, for patients) or the
//                              request gets 404
//   "list"     the handler scopes its query itself (by practice or caller)
//   "global"   not practice data (catalogue, own account, creation that is
//              scoped by the server)
//   "admin"    platform admins only
//
// test/platform/tenant-map.test.js fails if an authenticated route is
// missing here, so new routes can't skip the decision.

const c = (resource, source) => [resource, source];
const byId = (resource) => [c(resource, "params.id")];

export const TENANT_MAP = {
  // catalogue (platform-wide)
  "GET /v1/banners/:id": "global",
  "POST /v1/banners": "global",
  "PUT /v1/banners/:id": "global",
  "DELETE /v1/banners/:id": "global",
  "POST /v1/procedures": "global",
  "PUT /v1/procedures/:id": "global",
  "DELETE /v1/procedures/:id": "global",
  "GET /v1/procedures/:slug": "global",
  "GET /v1/procedures/getById/:id": "global",
  "POST /v1/services": "global",
  "PUT /v1/services/:id": "global",
  "DELETE /v1/services/:id": "global",
  "GET /v1/services/:slug": "global",
  "GET /v1/services/getById/:id": "global",
  "POST /v1/services/import": "global",
  "GET /v1/doctors": "global",
  "GET /v1/doctors/:id": "global",
  "GET /v1/doctor-services": "global",
  "POST /v1/doctor-services": [c("doctor", "body.doctor_id")],
  "DELETE /v1/doctor-services/:id": byId("doctor_service"),
  "GET /v1/doctor-services/getByServiceId/:id": "global",

  // users & staff
  "GET /v1/users": "list",
  "POST /v1/users": [c("clinic", "body.clinic_id"), c("doctor", "body.doctor_id")],
  "GET /v1/users/me": "global",
  "GET /v1/users/patients": "list",
  "GET /v1/users/:id": byId("user"),
  "PUT /v1/users/:id": byId("user"),
  "DELETE /v1/users/:id": byId("user"),
  "PUT /v1/users/status/:id": byId("user"),
  "POST /v1/users/:id/change-password": byId("user"),
  "GET /v1/users/:id/patient-details": byId("patient"),
  "GET /v1/staff": "list",
  "POST /v1/staff": [c("doctor", "body.doctor_id"), c("user", "body.staff_id")],
  "GET /v1/staff/:id": byId("staff"),
  "DELETE /v1/staff/:id": byId("staff"),

  // clinics & scheduling
  "GET /v1/clinics": "list",
  "POST /v1/clinics": "global",
  "GET /v1/clinics/:id": byId("clinic"),
  "PUT /v1/clinics/:id": byId("clinic"),
  "DELETE /v1/clinics/:id": byId("clinic"),
  "GET /v1/clinics/getByDoctorId/:id": byId("doctor"),
  "POST /v1/clinic-staff": [c("clinic", "body.clinic_id"), c("staff", "body.staff_id")],
  "DELETE /v1/clinic-staff/:id": byId("clinic_staff"),
  "GET /v1/clinic-staff/getByClinicId/:id": byId("clinic"),
  "POST /v1/clinic-patients": [c("clinic", "body.clinic_id"), c("patient", "body.patient_id")],
  "DELETE /v1/clinic-patients/:id": byId("clinic_patient"),
  "GET /v1/clinic-patients/getByClinicId/:id": byId("clinic"),
  "GET /v1/slots": "list",
  "POST /v1/slots": [c("clinic", "body.clinic_id")],
  "GET /v1/slots/:id": byId("slot"),
  "PUT /v1/slots/:id": byId("slot"),
  "DELETE /v1/slots/:id": byId("slot"),
  "GET /v1/slots/getByClinicId/:id": byId("clinic"),
  "POST /v1/block-slots": [c("clinic", "body.clinic_id")],
  "DELETE /v1/block-slots/:id": byId("blocked_slot"),
  "GET /v1/block-slots/getByClinicId/:id": byId("clinic"),
  "GET /v1/block-slots/getByDateAndClinic": [c("clinic", "query.clinic")],
  "GET /v1/bookings": "list",
  "POST /v1/bookings": [c("clinic", "body.clinic_id"), c("patient", "body.patient_id")],
  "PUT /v1/bookings/:id": byId("booking"),
  "PUT /v1/bookings/status/:id": byId("booking"),
  "GET /v1/bookings/getByClinicId/:id": byId("clinic"),
  "GET /v1/bookings/getByDateAndClinic": [c("clinic", "query.clinic")],

  // patients & clinical records
  "GET /v1/patients": "list",
  "POST /v1/patients/import": "global",
  "GET /v1/comprehensive-examinations": "list",
  "POST /v1/comprehensive-examinations": [c("patient", "body.patient_id")],
  "POST /v1/comprehensive-examinations/multiPart": [c("patient", "body.patient_id")],
  "PUT /v1/comprehensive-examinations/:id": byId("examination"),
  "PUT /v1/comprehensive-examinations/multiPart/:id": byId("examination"),
  "DELETE /v1/comprehensive-examinations/:id": byId("examination"),
  "GET /v1/comprehensive-examinations/getByPatientId/:id": byId("patient"),
  "GET /v1/notes/:id": byId("note"),
  "POST /v1/notes": [c("patient", "body.patient_id")],
  "PUT /v1/notes/:id": byId("note"),
  "DELETE /v1/notes/:id": byId("note"),
  "GET /v1/notes/getByPatientId/:id": byId("patient"),
  "GET /v1/documents": "list",
  "POST /v1/documents": [c("patient", "body.patient_id")],
  "GET /v1/documents/:id": byId("document"),
  "PUT /v1/documents/:id": byId("document"),
  "DELETE /v1/documents/:id": byId("document"),
  "GET /v1/documents/getByPatientId/:id": byId("patient"),
  "GET /v1/documents/get-by-treatment-id/:id": byId("treatment"),

  // treatments
  "POST /v1/treatments": [c("clinic", "body.clinic_id"), c("patient", "body.patient_id")],
  "GET /v1/treatments/:id": byId("treatment"),
  "PUT /v1/treatments/:id": byId("treatment"),
  "DELETE /v1/treatments/:id": byId("treatment"),
  "GET /v1/treatments/getByClinicId/:id": byId("clinic"),
  "GET /v1/treatments/getByPatientId": "list",
  "GET /v1/treatments/getPatientDetails": "list",
  "GET /v1/treatments/getByPatientAndClinicId/:patient_id/:clinic_id": [
    c("patient", "params.patient_id"),
    c("clinic", "params.clinic_id"),
  ],
  "GET /v1/treatments/getPatientDetailsByPatientAndClinicId/:patient_id/:clinic_id": [
    c("patient", "params.patient_id"),
    c("clinic", "params.clinic_id"),
  ],
  "POST /v1/treatment-plans": [c("treatment", "body.treatment_id"), c("patient", "body.patient_id")],
  "GET /v1/treatment-plans/:id": byId("treatment_plan"),
  "PUT /v1/treatment-plans/:id": byId("treatment_plan"),
  "DELETE /v1/treatment-plans/:id": byId("treatment_plan"),
  "GET /v1/treatment-plans/getByPatientId/:id": byId("patient"),
  "GET /v1/treatment-plans/getByTreatmentId/:id": byId("treatment"),
  "POST /v1/treatment-prescriptions": [c("treatment", "body.treatment_id")],
  "GET /v1/treatment-prescriptions/:id": byId("treatment_prescription"),
  "PUT /v1/treatment-prescriptions/:id": byId("treatment_prescription"),
  "DELETE /v1/treatment-prescriptions/:id": byId("treatment_prescription"),
  "GET /v1/treatment-prescriptions/getByTreatmentId/:id": byId("treatment"),
  "GET /v1/treatment-visits": "list",
  "POST /v1/treatment-visits": [c("treatment", "body.treatment_id")],
  "GET /v1/treatment-visits/:id": byId("treatment_visit"),
  "PUT /v1/treatment-visits/:id": byId("treatment_visit"),
  "DELETE /v1/treatment-visits/:id": byId("treatment_visit"),
  "GET /v1/treatment-visits/getByTreatmentId/:id": byId("treatment"),
  "POST /v1/treatment-history": [c("treatment", "body.treatment_id")],
  "GET /v1/treatment-history/:id": byId("treatment_history"),
  "PUT /v1/treatment-history/:id": byId("treatment_history"),
  "DELETE /v1/treatment-history/:id": byId("treatment_history"),
  "GET /v1/treatment-history/getbyTreatment/:treatment_id": [c("treatment", "params.treatment_id")],
  "POST /v1/investigations": [c("treatment", "body.treatment_id")],
  "GET /v1/investigations/:id": byId("investigation"),
  "PUT /v1/investigations/:id": byId("investigation"),
  "DELETE /v1/investigations/:id": byId("investigation"),
  "GET /v1/investigations/getByTreatmentId/:id": byId("treatment"),
  "POST /v1/x-rays": [c("treatment", "body.treatment_id")],
  "GET /v1/x-rays/:id": byId("xray"),
  "PUT /v1/x-rays/:id": byId("xray"),
  "DELETE /v1/x-rays/:id": byId("xray"),
  "GET /v1/x-rays/getByTreatmentId/:id": byId("treatment"),

  // billing & reports
  "GET /v1/treatment-payments": "list",
  "POST /v1/treatment-payments": [c("treatment", "body.treatment_id"), c("clinic", "body.clinic_id")],
  "GET /v1/treatment-payments/:id": byId("treatment_payment"),
  "PUT /v1/treatment-payments/:id": byId("treatment_payment"),
  "DELETE /v1/treatment-payments/:id": byId("treatment_payment"),
  "GET /v1/treatment-payments/accounts/:id": byId("clinic"),
  "GET /v1/treatment-payments/getByPatientId/:id": byId("patient"),
  "GET /v1/treatment-payments/getByTreatmentId/:id": byId("treatment"),
  "GET /v1/treatment-payments/getRemainingPayment/:id": byId("treatment"),
  "GET /v1/ledgers": "list",
  "POST /v1/ledgers": [c("clinic", "body.clinic_id"), c("patient", "body.patient_id")],
  "GET /v1/ledgers/:id": byId("ledger"),
  "DELETE /v1/ledgers/:id": byId("ledger"),
  "GET /v1/ledgers/:clinic_id/:patient_id": [
    c("clinic", "params.clinic_id"),
    c("patient", "params.patient_id"),
  ],
  "GET /v1/reports": "admin",
  "GET /v1/reports/:id": byId("clinic"),

  // background jobs (controller filters by practiceId in the job data)
  "GET /v1/jobs/failed": "list",
  "POST /v1/jobs/:id/retry": "list",

  // leads: configuration (services also filter by practice)
  "GET /v1/pipelines": "list",
  "POST /v1/pipelines": [c("clinic", "body.clinic_id")],
  "GET /v1/pipelines/:id": byId("pipeline"),
  "PUT /v1/pipelines/:id": [c("pipeline", "params.id"), c("clinic", "body.clinic_id")],
  "DELETE /v1/pipelines/:id": byId("pipeline"),
  "POST /v1/pipelines/:id/default": byId("pipeline"),
  "POST /v1/pipelines/:id/archive": byId("pipeline"),
  "POST /v1/pipelines/:id/unarchive": byId("pipeline"),
  "PUT /v1/pipelines/:id/members": byId("pipeline"),
  "POST /v1/pipelines/:id/stages": byId("pipeline"),
  "PUT /v1/pipelines/:id/stages/reorder": byId("pipeline"),
  "PUT /v1/pipeline-stages/:id": byId("pipeline_stage"),
  "DELETE /v1/pipeline-stages/:id": byId("pipeline_stage"),
  "GET /v1/custom-fields": "list",
  "POST /v1/custom-fields": "list",
  "PUT /v1/custom-fields/:id": byId("custom_field"),
  "POST /v1/custom-fields/:id/archive": byId("custom_field"),
  "POST /v1/custom-fields/:id/unarchive": byId("custom_field"),
  "GET /v1/tags": "list",
  "POST /v1/tags": "list",
  "DELETE /v1/tags/:id": byId("tag"),
};

// SQL returning { practice_id, patient_id, user_id } for one row id.
// patient_id/user_id let us keep patients to their own records.
const viaTreatment = (table) => `
  SELECT t.practice_id, t.patient_id, NULL::uuid AS user_id
    FROM ${table} x JOIN treatments t ON t.id = x.treatment_id WHERE x.id = :id`;

export const RESOURCES = {
  clinic: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM clinics WHERE id = :id`,
  doctor: `SELECT practice_id, NULL::uuid AS patient_id, user_id FROM doctors WHERE id = :id`,
  staff: `SELECT practice_id, NULL::uuid AS patient_id, user_id FROM staffs WHERE id = :id`,
  user: `SELECT u.practice_id, p.id AS patient_id, u.id AS user_id
           FROM users u LEFT JOIN patients p ON p.user_id = u.id WHERE u.id = :id`,
  patient: `SELECT practice_id, id AS patient_id, user_id FROM patients WHERE id = :id`,
  booking: `SELECT practice_id, patient_id, NULL::uuid AS user_id FROM bookings WHERE id = :id`,
  slot: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM slots WHERE id = :id`,
  blocked_slot: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM blocked_slots WHERE id = :id`,
  treatment: `SELECT practice_id, patient_id, NULL::uuid AS user_id FROM treatments WHERE id = :id`,
  ledger: `SELECT practice_id, patient_id, NULL::uuid AS user_id FROM ledgers WHERE id = :id`,
  note: `SELECT practice_id, patient_id, NULL::uuid AS user_id FROM notes WHERE id = :id`,
  document: `SELECT practice_id, patient_id, NULL::uuid AS user_id FROM documents WHERE id = :id`,
  examination: `SELECT practice_id, patient_id, NULL::uuid AS user_id FROM comprehensive_examinations WHERE id = :id`,
  clinic_patient: `SELECT c.practice_id, m.patient_id, NULL::uuid AS user_id
                     FROM clinic_patient_mappings m JOIN clinics c ON c.id = m.clinic_id WHERE m.id = :id`,
  clinic_staff: `SELECT c.practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id
                   FROM clinic_staff_mappings m JOIN clinics c ON c.id = m.clinic_id WHERE m.id = :id`,
  doctor_service: `SELECT d.practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id
                     FROM doctor_service_mappings m JOIN doctors d ON d.id = m.doctor_id WHERE m.id = :id`,
  treatment_plan: viaTreatment("treatment_plans"),
  treatment_payment: viaTreatment("treatment_payments"),
  treatment_visit: viaTreatment("treatment_visits"),
  treatment_prescription: viaTreatment("treatment_prescriptions"),
  treatment_history: viaTreatment("treatment_histories"),
  investigation: viaTreatment("investigations"),
  xray: viaTreatment("xrays"),
  pipeline: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM pipelines WHERE id = :id`,
  pipeline_stage: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM pipeline_stages WHERE id = :id`,
  custom_field: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM custom_fields WHERE id = :id`,
  tag: `SELECT practice_id, NULL::uuid AS patient_id, NULL::uuid AS user_id FROM tags WHERE id = :id`,
};
