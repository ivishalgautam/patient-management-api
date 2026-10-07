"use strict";
import config from "../config/index.js";
import { select, one, exec } from "../db/sql.js";
import { decryptJson } from "../lib/integrations/secrets.js";
import { ingestNormalizedLead, logEvent, updateEvent } from "../lib/integrations/ingest.js";
import * as facebook from "../lib/integrations/providers/facebook-leads.js";
import * as customWebhook from "../lib/integrations/providers/custom-webhook.js";
import * as google from "../lib/integrations/providers/google-ads.js";

const loadIntegration = (id) => one(`SELECT * FROM integrations WHERE id = :id`, { id });
const formName = (integration, formId) =>
  integration.account_ref?.forms?.find((f) => f.id === formId)?.name ?? null;

// Turns a stored webhook delivery into lead(s). Retryable provider errors
// are rethrown so pg-boss retries with backoff; the event keeps the error.
export async function processEvent({ integrationId, eventId }) {
  const integration = await loadIntegration(integrationId);
  const event = await one(`SELECT * FROM integration_events WHERE id = :eventId`, { eventId });
  if (!integration || !event) return;
  if (integration.status === "disabled") {
    return updateEvent(eventId, { status: "ignored", error: "Integration is disabled." });
  }
  const payload = decryptJson(event.payload_encrypted);
  if (!payload) return updateEvent(eventId, { status: "error", error: "Payload no longer stored." });

  if (integration.provider_key === "facebook_leads") {
    const secrets = decryptJson(integration.secrets_encrypted);
    if (!secrets?.page_access_token) {
      return updateEvent(eventId, { status: "error", error: "Facebook is disconnected; reconnect to receive leads." });
    }
    let lead;
    try {
      lead = await facebook.fetchLead(payload.leadgenId, secrets.page_access_token);
    } catch (error) {
      await updateEvent(eventId, { status: "error", error: error.message, providerLeadId: payload.leadgenId });
      if (error.code === 190) {
        await exec(`UPDATE integrations SET status = 'needs_reauth', last_error = :e WHERE id = :id`, {
          id: integration.id,
          e: error.message,
        });
        return;
      }
      if (error.retryable) throw error;
      return;
    }
    return ingestNormalizedLead(integration, facebook.toNormalized(lead, formName(integration, lead.form_id)), {
      eventId,
    });
  }

  if (integration.provider_key === "custom_webhook") {
    return ingestNormalizedLead(integration, customWebhook.toNormalized(payload, integration), { eventId });
  }

  if (integration.provider_key === "google_ads_lead_form") {
    const normalized = google.toNormalized(payload);
    // "Send test data" in Google Ads: proves the setup works without adding
    // a fake lead, unless the practice asked to keep test leads.
    if (normalized.isTest && !integration.account_ref?.accept_test_leads) {
      await exec(`UPDATE integrations SET last_event_at = now(), updated_at = now() WHERE id = :id`, { id: integration.id });
      return updateEvent(eventId, {
        status: "ignored",
        providerLeadId: normalized.providerLeadId,
        error: "Test lead from Google Ads received. The connection works; test leads aren't added.",
      });
    }
    return ingestNormalizedLead(integration, normalized, { eventId });
  }

  return updateEvent(eventId, { status: "ignored", error: `No processor for ${integration.provider_key}` });
}

// Safety net next to the webhook: pulls recent leads from the selected
// forms. Known provider ids are skipped without logging.
export async function pullFacebook({ integrationId } = {}) {
  const integrations = integrationId
    ? [await loadIntegration(integrationId)]
    : await select(`SELECT * FROM integrations WHERE provider_key = 'facebook_leads' AND status IN ('active', 'error')`);
  for (const integration of integrations.filter(Boolean)) {
    const secrets = decryptJson(integration.secrets_encrypted);
    if (!secrets?.page_access_token) continue;
    const since = integration.last_synced_at
      ? new Date(new Date(integration.last_synced_at).getTime() - 60 * 60 * 1000)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      let formIds = integration.account_ref?.form_ids ?? [];
      if (!formIds.length) {
        formIds = (await facebook.listForms(integration.account_ref.page_id, secrets.page_access_token)).map((f) => f.id);
      }
      const leads = await facebook.fetchSince(formIds, secrets.page_access_token, since);
      const known = new Set(
        (
          await select(`SELECT provider_lead_id FROM integration_lead_refs WHERE integration_id = :id`, {
            id: integration.id,
          })
        ).map((r) => r.provider_lead_id),
      );
      for (const lead of leads.filter((l) => !known.has(String(l.id)))) {
        await ingestNormalizedLead(integration, facebook.toNormalized(lead, formName(integration, lead.form_id)), {
          direction: "pull",
        });
      }
      await exec(`UPDATE integrations SET last_synced_at = now() WHERE id = :id`, { id: integration.id });
    } catch (error) {
      await logEvent(integration, { direction: "pull", status: "error", error: `Sync failed: ${error.message}`, keepRaw: false });
      await exec(
        `UPDATE integrations SET last_error = :e,
                status = CASE WHEN :reauth THEN 'needs_reauth'::enum_integrations_status ELSE status END
          WHERE id = :id`,
        { id: integration.id, e: error.message, reauth: error.code === 190 },
      );
    }
  }
}

// Records token expiry; invalid tokens flip the integration to needs_reauth.
export async function checkFacebookToken(integration) {
  const secrets = decryptJson(integration.secrets_encrypted);
  if (!secrets?.page_access_token) return;
  try {
    const info = await facebook.inspectToken(secrets.page_access_token);
    await exec(
      `UPDATE integrations SET token_expires_at = :expires,
              status = CASE WHEN :valid THEN (CASE WHEN status = 'needs_reauth' THEN 'active' ELSE status END)
                            ELSE 'needs_reauth' END::enum_integrations_status,
              last_error = CASE WHEN :valid THEN last_error ELSE 'Facebook access expired or was revoked. Reconnect.' END,
              updated_at = now()
        WHERE id = :id`,
      { id: integration.id, expires: info.expiresAt, valid: info.valid },
    );
  } catch (error) {
    await exec(`UPDATE integrations SET last_error = :e WHERE id = :id`, { id: integration.id, e: `Token check failed: ${error.message}` });
  }
}

export async function checkAllFacebookTokens() {
  const rows = await select(`SELECT * FROM integrations WHERE provider_key = 'facebook_leads' AND status <> 'disabled'`);
  for (const row of rows) await checkFacebookToken(row);
}

export async function purgeIntegrationPayloads() {
  await exec(
    `UPDATE integration_events SET payload_encrypted = NULL
      WHERE payload_encrypted IS NOT NULL AND created_at < now() - make_interval(days => :days)`,
    { days: config.integrations.payload_retention_days },
  );
  await exec(`DELETE FROM oauth_sessions WHERE expires_at < now()`);
}
