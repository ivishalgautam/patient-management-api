"use strict";
// Action-level permissions. Roles hold a set of these keys (role_permissions).
// Platform admins bypass permission checks entirely.

export const PERMISSIONS = {
  "patients.view": "View patients in the practice",
  "patients.create": "Register patients",
  "patients.edit": "Edit patients",
  "patients.delete": "Delete patients",
  "patients.import": "Import patients from Excel",
  "appointments.view": "View appointments",
  "appointments.manage": "Book, reschedule and complete appointments",
  "schedule.view": "View slots and blocked slots",
  "schedule.manage": "Manage slots and blocked slots",
  "clinics.view": "View clinics",
  "clinics.manage": "Create and edit clinics, assign staff",
  "treatments.view": "View treatments and clinical records",
  "treatments.manage": "Create and edit treatments and clinical records",
  "billing.view": "View payments and ledgers",
  "billing.manage": "Record payments and ledger entries",
  "users.view": "View staff",
  "users.manage": "Create, edit and deactivate staff",
  "reports.view": "View practice reports and accounts",
  "doctor_services.manage": "Manage the services a doctor offers",
  "catalogue.manage": "Manage procedures, services and banners (platform)",
  "roles.manage": "Manage roles and permissions",
  "jobs.manage": "See and retry failed background jobs",
  "leads.view": "View leads assigned to me",
  "leads.view_all": "View every lead in the practice",
  "leads.create": "Create leads",
  "leads.edit": "Edit leads, move stages, add notes and follow-ups",
  "leads.delete": "Delete leads",
  "leads.assign": "Assign leads to team members",
  "leads.import": "Import leads from files and sheets",
  "leads.export": "Export leads",
  "leads.convert": "Convert leads into patients",
  "pipelines.manage": "Configure pipelines and stages",
  "forms.manage": "Build lead forms",
  "custom_fields.manage": "Manage custom fields",
  "integrations.manage": "Connect and manage lead integrations",
  // Patients: their own records only (tenant guard enforces ownership).
  "self.records": "Patient self-service: own bookings, treatments, payments, documents",
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS);

const all = (prefix) => PERMISSION_KEYS.filter((k) => k.startsWith(prefix));

// Defaults for the system roles, matching what each role can reach today.
export const SYSTEM_ROLE_PERMISSIONS = {
  admin: [...PERMISSION_KEYS],
  doctor: PERMISSION_KEYS.filter((k) => k !== "catalogue.manage" && k !== "self.records"),
  staff: [
    "patients.view",
    "patients.create",
    "patients.edit",
    ...all("appointments."),
    "schedule.view",
    "clinics.view",
    ...all("treatments."),
    ...all("billing."),
    "leads.view",
    "leads.view_all",
    "leads.create",
    "leads.edit",
    "leads.convert",
  ],
  patient: ["self.records"],
};

export const SYSTEM_ROLES = {
  admin: "Platform admin",
  doctor: "Doctor (practice owner)",
  staff: "Staff",
  patient: "Patient",
};
