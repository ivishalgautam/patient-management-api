"use strict";
// Shared by the email services: the module switch, account lookup and the
// {{variables}} for a lead, patient or plain address.
import { one } from "../../db/sql.js";
import { AppError, notFound } from "../../lib/app-error.js";

export async function getSettingsRow(practiceId) {
  return (await one(`SELECT * FROM email_settings WHERE practice_id = :practiceId`, { practiceId })) ?? {
    practice_id: practiceId,
    is_enabled: true,
    default_from_name: null,
    default_account_id: null,
    signature: null,
  };
}

// Email can be switched off for the whole practice in Email › Settings.
export async function assertEnabled(ctx) {
  const settings = await getSettingsRow(ctx.practiceId);
  if (!settings.is_enabled) throw new AppError(403, "Email is switched off for this practice (Email › Settings).", { code: "EMAIL_DISABLED" });
  return settings;
}

// The account to send from: the one asked for, else the default.
export async function sendingAccount(ctx, accountId = null) {
  const settings = await getSettingsRow(ctx.practiceId);
  const account = await one(
    `SELECT * FROM email_accounts WHERE practice_id = :practiceId AND status <> 'paused'
        AND (:accountId::uuid IS NULL OR id = :accountId)
      ORDER BY (id = :defaultId) DESC NULLS LAST, is_default DESC, created_at LIMIT 1`,
    { practiceId: ctx.practiceId, accountId, defaultId: settings.default_account_id },
  );
  if (!account) {
    throw accountId
      ? notFound("That email account isn't available (removed or paused).")
      : new AppError(409, "Connect an email account first (Email › Accounts).", { code: "EMAIL_NO_ACCOUNT" });
  }
  return { account, settings };
}

const firstName = (name = "") => String(name).trim().split(/\s+/)[0] ?? "";
const titleCase = (s = "") => String(s).replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// {{variables}} for one recipient.
export async function variablesFor(practiceId, { leadId = null, patientId = null, name = null, email = null } = {}) {
  const practice = await one(`SELECT name FROM practices WHERE id = :practiceId`, { practiceId });
  let person = { name, email, phone: null, stage: null, pipeline: null };
  if (leadId) {
    const lead = await one(
      `SELECT l.full_name, l.email, l.phone, s.name AS stage, p.name AS pipeline
         FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id JOIN pipelines p ON p.id = l.pipeline_id WHERE l.id = :leadId`,
      { leadId },
    );
    if (lead) person = { name: lead.full_name, email: lead.email, phone: lead.phone, stage: lead.stage, pipeline: lead.pipeline };
  } else if (patientId) {
    const patient = await one(`SELECT u.fullname, u.email, u.mobile_number FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = :patientId`, {
      patientId,
    });
    if (patient) person = { name: patient.fullname, email: patient.email, phone: patient.mobile_number, stage: null, pipeline: null };
  }
  const full = titleCase(person.name ?? "");
  return {
    name: full || "there",
    first_name: titleCase(firstName(person.name ?? "")) || "there",
    email: person.email ?? email ?? "",
    phone: person.phone ?? "",
    stage: person.stage ?? "",
    pipeline: person.pipeline ?? "",
    clinic: practice?.name ?? "",
  };
}

// Finds the lead or patient an address belongs to (for linking mail).
export async function matchContact(practiceId, address) {
  const email = String(address ?? "").trim().toLowerCase();
  if (!email) return { leadId: null, patientId: null };
  const lead = await one(
    `SELECT id FROM leads WHERE practice_id = :practiceId AND email_normalized = :email AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    { practiceId, email },
  );
  const patient = await one(
    `SELECT p.id FROM patients p JOIN users u ON u.id = p.user_id WHERE p.practice_id = :practiceId AND lower(u.email) = :email LIMIT 1`,
    { practiceId, email },
  );
  return { leadId: lead?.id ?? null, patientId: patient?.id ?? null };
}
