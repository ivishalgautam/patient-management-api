"use strict";
import { one, exec } from "../../db/sql.js";
import { practiceFields } from "../leads/custom-values.js";
import { createLead, systemContext } from "../../api/lead/service.js";
import { mapAnswers } from "./field-mapping.js";
import { redact } from "./redact.js";
import { encryptJson } from "./secrets.js";

const PROVIDER_SOURCE = {
  facebook_leads: "Facebook",
  google_ads_lead_form: "Google",
  sheet_import: "Import",
  custom_webhook: "Website",
};

export async function logEvent(integration, event) {
  return one(
    `INSERT INTO integration_events (practice_id, integration_id, direction, status, provider_lead_id, lead_id,
                                     payload_redacted, payload_encrypted, error_message, attempts)
     VALUES (:practiceId, :integrationId, :direction, :status, :providerLeadId, :leadId,
             :redacted::jsonb, :encrypted, :error, :attempts) RETURNING *`,
    {
      practiceId: integration.practice_id,
      integrationId: integration.id,
      direction: event.direction ?? "inbound",
      status: event.status,
      providerLeadId: event.providerLeadId ?? null,
      leadId: event.leadId ?? null,
      redacted: event.raw === undefined ? null : JSON.stringify(redact(event.raw)),
      encrypted: event.raw === undefined || event.keepRaw === false ? null : encryptJson(event.raw),
      error: event.error ?? null,
      attempts: event.attempts ?? 0,
    },
  );
}

export async function updateEvent(eventId, patch) {
  await exec(
    `UPDATE integration_events SET status = :status, lead_id = coalesce(:leadId, lead_id),
            provider_lead_id = coalesce(:providerLeadId, provider_lead_id),
            error_message = :error, attempts = attempts + 1, updated_at = now()
      WHERE id = :eventId`,
    {
      eventId,
      status: patch.status,
      leadId: patch.leadId ?? null,
      providerLeadId: patch.providerLeadId ?? null,
      error: patch.error ?? null,
    },
  );
}

async function touchIntegration(integration, error) {
  await exec(
    `UPDATE integrations SET last_event_at = now(), last_error = :error,
            status = CASE WHEN status IN ('disabled', 'needs_reauth') THEN status
                          WHEN :error::text IS NULL THEN 'active' ELSE 'error' END,
            updated_at = now()
      WHERE id = :id`,
    { id: integration.id, error: error ?? null },
  );
}

/**
 * normalized: { providerLeadId, answers: { key: value }, submittedAt?, subSource?, raw? }
 * Creates (or merges/dedupes) one lead. Never throws: the outcome is written
 * to the event (eventId) or a new one, and returned.
 */
export async function ingestNormalizedLead(integration, normalized, { direction = "inbound", eventId } = {}) {
  const finish = async (status, extra = {}) => {
    const patch = { status, providerLeadId: normalized?.providerLeadId, ...extra };
    if (eventId) await updateEvent(eventId, patch);
    else await logEvent(integration, { direction, raw: normalized?.raw, ...patch });
    await touchIntegration(integration, status === "error" ? extra.error : null);
    return patch;
  };

  try {
    if (!normalized?.providerLeadId) throw new Error("The provider sent no lead id; can't dedupe.");
    const ref = await one(
      `SELECT lead_id FROM integration_lead_refs WHERE integration_id = :id AND provider_lead_id = :pid`,
      { id: integration.id, pid: String(normalized.providerLeadId) },
    );
    if (ref) return finish("duplicate", { leadId: ref.lead_id, error: "Already received." });
    if (!integration.default_pipeline_id || !integration.default_stage_id) {
      throw new Error("Choose a pipeline and stage for this integration before leads can be created.");
    }

    const fields = await practiceFields(integration.practice_id);
    const { lead: mapped, warnings } = mapAnswers(normalized.answers, { mapping: integration.field_mapping, fields });
    if (!mapped.full_name) mapped.full_name = "Unknown";
    if (!mapped.phone && !mapped.email) throw new Error("The lead has no phone number or email.");

    const result = await createLead(
      systemContext(integration.practice_id),
      {
        ...mapped,
        pipeline_id: integration.default_pipeline_id,
        stage_id: integration.default_stage_id,
        clinic_id: integration.clinic_id,
        source: PROVIDER_SOURCE[integration.provider_key] ?? integration.name,
        sub_source: normalized.subSource ?? integration.name,
        submitted_at: normalized.submittedAt ?? null,
      },
      {
        dedupe: integration.dedupe_policy,
        assignment: "round_robin",
        integrationId: integration.id,
        via: {
          type: integration.provider_key,
          activityType: "integration",
          body: `Received from ${integration.name}`,
          metadata: { integration_id: integration.id, ...(warnings.length ? { warnings } : {}) },
        },
      },
    );
    await exec(
      `INSERT INTO integration_lead_refs (integration_id, provider_lead_id, lead_id)
       VALUES (:id, :pid, :leadId) ON CONFLICT (integration_id, provider_lead_id) DO NOTHING`,
      { id: integration.id, pid: String(normalized.providerLeadId), leadId: result.lead.id },
    );
    return finish(result.created ? "processed" : "duplicate", {
      leadId: result.lead.id,
      error: warnings.length ? warnings.join("; ") : result.created ? null : "Matched an existing lead.",
    });
  } catch (error) {
    return finish("error", { error: error.message });
  }
}
