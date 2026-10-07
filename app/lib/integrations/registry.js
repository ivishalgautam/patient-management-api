"use strict";
import { one } from "../../db/sql.js";

// Integration providers. Every provider feeds the same pipeline:
// webhook/pull/import -> integration_events -> ingestNormalizedLead().
// `feature` names a practice_features switch for optional add-ons.
export const PROVIDERS = {
  facebook_leads: {
    key: "facebook_leads",
    name: "Facebook & Instagram Lead Ads",
    kind: "oauth",
    description: "Leads from Meta Lead Ad forms, in real time (webhook) with a periodic safety sync.",
  },
  custom_webhook: {
    key: "custom_webhook",
    name: "Custom webhook",
    kind: "webhook",
    description: "POST JSON from any website builder or Zapier to a private URL.",
  },
  google_ads_lead_form: {
    key: "google_ads_lead_form",
    name: "Google Ads lead forms",
    kind: "webhook",
    feature: "google_leads",
    description: "Leads from Google Ads lead form assets via webhook (add-on).",
  },
  sheet_import: {
    key: "sheet_import",
    name: "Google Sheets / CSV import",
    kind: "import",
    feature: "google_leads",
    description: "Import leads from a CSV/XLSX file or a shared Google Sheet (add-on).",
  },
};

// Optional add-ons a practice (or one clinic) can switch on.
export const FEATURES = {
  google_leads: {
    key: "google_leads",
    name: "Google leads",
    description: "Google Ads lead form webhook and Google Sheets / CSV lead import.",
  },
};

export function getProvider(key) {
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`Unknown integration provider "${key}"`);
  return provider;
}

// Add-on switch: practice-wide row, or the clinic's row when given.
export async function featureEnabled(practiceId, feature, clinicId = null) {
  if (!feature) return true;
  const row = await one(
    `SELECT enabled FROM practice_features
      WHERE practice_id = :practiceId AND feature_key = :feature
        AND (clinic_id IS NULL OR clinic_id = :clinicId)
      ORDER BY (clinic_id IS NULL) LIMIT 1`,
    { practiceId, feature, clinicId },
  );
  return !!row?.enabled;
}
