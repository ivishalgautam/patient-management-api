"use strict";
import { decryptJson, safeEqual } from "../secrets.js";

// Google Ads lead form assets (add-on). Google POSTs each lead to the
// webhook URL with the key the practice typed into the form's webhook
// settings ("google_key"). Payload:
//   { lead_id, form_id, campaign_id, adgroup_id, gcl_id, google_key, is_test,
//     user_column_data: [{ column_id: "FULL_NAME", column_name, string_value }] }

// Standard column ids -> answer keys understood by mapAnswers().
const STANDARD = {
  FULL_NAME: "full_name",
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  EMAIL: "email",
  PHONE_NUMBER: "phone_number",
};
// Used only when the standard column is missing.
const FALLBACK = { WORK_EMAIL: "email", WORK_PHONE: "phone_number" };

export function verifyGoogleKey(integration, body) {
  const secrets = decryptJson(integration.secrets_encrypted);
  return safeEqual(body?.google_key, secrets?.google_key);
}

export function toNormalized(payload) {
  const answers = {};
  const fallbacks = {};
  for (const column of payload?.user_column_data ?? []) {
    const value = column?.string_value;
    if (value === undefined || value === null || value === "") continue;
    const id = String(column.column_id ?? "").toUpperCase();
    if (STANDARD[id]) answers[STANDARD[id]] = value;
    else if (FALLBACK[id]) fallbacks[FALLBACK[id]] = value;
    else answers[column.column_name || column.column_id] = value;
  }
  for (const [key, value] of Object.entries(fallbacks)) answers[key] ??= value;

  return {
    providerLeadId: payload?.lead_id ? String(payload.lead_id) : null,
    answers,
    isTest: payload?.is_test === true || payload?.is_test === "true",
    submittedAt: payload?.lead_submit_time ?? null,
    raw: payload,
  };
}
