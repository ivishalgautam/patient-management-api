"use strict";
import config from "../../config/index.js";
import { select, one, exec } from "../../db/sql.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/app-error.js";
import { PROVIDERS, featureEnabled, getProvider } from "../../lib/integrations/registry.js";
import { decryptJson, encryptJson, generateWebhookToken } from "../../lib/integrations/secrets.js";
import { signState, verifyState } from "../../lib/integrations/oauth-state.js";
import * as facebook from "../../lib/integrations/providers/facebook-leads.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";

const WEBHOOK_PATHS = {
  custom_webhook: "custom",
  google_ads_lead_form: "google-ads",
};

export function toClient(row) {
  if (!row) return row;
  const { secrets_encrypted, webhook_token, ...rest } = row;
  const path = WEBHOOK_PATHS[row.provider_key];
  return {
    ...rest,
    provider: PROVIDERS[row.provider_key]?.name ?? row.provider_key,
    has_secrets: !!secrets_encrypted,
    webhook_url: path && webhook_token ? `${config.api_url}/webhooks/${path}/${webhook_token}` : null,
    token_expiring_soon:
      !!row.token_expires_at && new Date(row.token_expires_at) < new Date(Date.now() + 7 * 86400000),
  };
}

async function loadIntegration(ctx, id) {
  const row = await one(`SELECT * FROM integrations WHERE id = :id AND practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Integration not found.");
  return row;
}

export async function listProviders(ctx) {
  const out = [];
  for (const p of Object.values(PROVIDERS)) {
    out.push({
      ...p,
      enabled: await featureEnabled(ctx.practiceId, p.feature),
      configured: p.key === "facebook_leads" ? facebook.isConfigured() : true,
    });
  }
  return out;
}

export async function listIntegrations(ctx) {
  const rows = await select(
    `SELECT i.*, p.name AS pipeline_name, s.name AS stage_name,
            (SELECT count(*)::int FROM integration_events e WHERE e.integration_id = i.id AND e.status = 'error'
               AND e.created_at > now() - interval '7 days') AS errors_7d
       FROM integrations i
       LEFT JOIN pipelines p ON p.id = i.default_pipeline_id
       LEFT JOIN pipeline_stages s ON s.id = i.default_stage_id
      WHERE i.practice_id = :practiceId ORDER BY i.created_at DESC`,
    { practiceId: ctx.practiceId },
  );
  return rows.map(toClient);
}

export const getIntegration = async (ctx, id) => toClient(await loadIntegration(ctx, id));

async function validateTarget(ctx, { default_pipeline_id: pipelineId, default_stage_id: stageId, clinic_id: clinicId }) {
  if (stageId || pipelineId) {
    const stage = await one(
      `SELECT 1 FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id
        WHERE s.id = :stageId AND s.pipeline_id = :pipelineId AND s.practice_id = :practiceId
          AND s.archived_at IS NULL AND p.archived_at IS NULL`,
      { stageId: stageId ?? null, pipelineId: pipelineId ?? null, practiceId: ctx.practiceId },
    );
    if (!stage) throw badRequest("Choose an active stage of the selected pipeline.");
  }
  if (clinicId) {
    const clinic = await one(`SELECT 1 FROM clinics WHERE id = :c AND practice_id = :p`, { c: clinicId, p: ctx.practiceId });
    if (!clinic) throw badRequest("Clinic not found in this practice.");
  }
}

async function validateMapping(ctx, mapping = {}) {
  const custom = Object.values(mapping).filter((t) => String(t).startsWith("cf:")).map((t) => t.slice(3));
  if (!custom.length) return;
  const found = await select(`SELECT key FROM custom_fields WHERE practice_id = :p AND key IN (:keys) AND archived_at IS NULL`, {
    p: ctx.practiceId,
    keys: custom,
  });
  const missing = custom.filter((k) => !found.some((f) => f.key === k));
  if (missing.length) throw badRequest(`Unknown custom field(s) in mapping: ${missing.join(", ")}`);
}

export async function updateIntegration(ctx, id, input) {
  const row = await loadIntegration(ctx, id);
  const merged = {
    default_pipeline_id: input.default_pipeline_id ?? row.default_pipeline_id,
    default_stage_id: input.default_stage_id ?? row.default_stage_id,
    clinic_id: "clinic_id" in input ? input.clinic_id : row.clinic_id,
  };
  await validateTarget(ctx, merged);
  if (input.field_mapping) await validateMapping(ctx, input.field_mapping);
  if (input.status === "active" && !row.secrets_encrypted && row.provider_key === "facebook_leads") {
    throw conflict("Reconnect Facebook to re-enable this integration.");
  }
  await exec(
    `UPDATE integrations SET name = coalesce(:name, name), default_pipeline_id = :pipelineId,
            default_stage_id = :stageId, clinic_id = :clinicId,
            field_mapping = coalesce(:mapping::jsonb, field_mapping),
            dedupe_policy = coalesce(:dedupe::enum_integrations_dedupe, dedupe_policy),
            account_ref = CASE WHEN :paths::jsonb IS NULL THEN account_ref
                               ELSE account_ref || jsonb_build_object('paths', :paths::jsonb) END,
            status = coalesce(:status::enum_integrations_status, status), updated_at = now()
      WHERE id = :id`,
    {
      id,
      name: input.name ?? null,
      pipelineId: merged.default_pipeline_id,
      stageId: merged.default_stage_id,
      clinicId: merged.clinic_id ?? null,
      mapping: input.field_mapping ? JSON.stringify(input.field_mapping) : null,
      dedupe: input.dedupe_policy ?? null,
      paths: input.paths ? JSON.stringify(input.paths) : null,
      status: input.status ?? null,
    },
  );
  return getIntegration(ctx, id);
}

export async function disconnect(ctx, id) {
  await loadIntegration(ctx, id);
  await exec(
    `UPDATE integrations SET status = 'disabled', secrets_encrypted = NULL, webhook_token = NULL, updated_at = now()
      WHERE id = :id`,
    { id },
  );
}

// custom_webhook and (add-on) google_ads_lead_form
export async function createWebhookIntegration(ctx, input) {
  const provider = getProvider(input.provider_key);
  if (provider.kind !== "webhook") throw badRequest("This provider is not connected with a webhook.");
  if (!(await featureEnabled(ctx.practiceId, provider.feature, input.clinic_id))) {
    throw forbidden(`${provider.name} is not enabled for this practice.`);
  }
  await validateTarget(ctx, input);
  await validateMapping(ctx, input.field_mapping);
  const secrets = input.provider_key === "google_ads_lead_form" ? { google_key: input.google_key } : null;
  if (secrets && !input.google_key) throw badRequest("google_key is required.");
  const row = await one(
    `INSERT INTO integrations (practice_id, clinic_id, provider_key, name, webhook_token, secrets_encrypted,
                               account_ref, default_pipeline_id, default_stage_id, field_mapping, dedupe_policy,
                               installed_by)
     VALUES (:practiceId, :clinicId, :provider, :name, :token, :secrets, :ref::jsonb, :pipelineId, :stageId,
             :mapping::jsonb, :dedupe, :userId) RETURNING *`,
    {
      practiceId: ctx.practiceId,
      clinicId: input.clinic_id ?? null,
      provider: input.provider_key,
      name: input.name,
      token: generateWebhookToken(),
      secrets: secrets ? encryptJson(secrets) : null,
      ref: JSON.stringify(input.paths ? { paths: input.paths } : {}),
      pipelineId: input.default_pipeline_id,
      stageId: input.default_stage_id,
      mapping: JSON.stringify(input.field_mapping ?? {}),
      dedupe: input.dedupe_policy ?? "merge",
      userId: ctx.userId,
    },
  );
  return toClient(row);
}

export async function rotateToken(ctx, id) {
  const row = await loadIntegration(ctx, id);
  if (!WEBHOOK_PATHS[row.provider_key]) throw badRequest("This integration has no webhook URL.");
  await exec(`UPDATE integrations SET webhook_token = :token, updated_at = now() WHERE id = :id`, {
    id,
    token: generateWebhookToken(),
  });
  return getIntegration(ctx, id);
}

export async function listEvents(ctx, id, { status, page = 1, limit = 20 }) {
  await loadIntegration(ctx, id);
  const rows = await select(
    `SELECT id, direction, status, provider_lead_id, lead_id, payload_redacted, error_message, attempts,
            payload_encrypted IS NOT NULL AS replayable, created_at, updated_at, count(*) OVER()::int AS total
       FROM integration_events WHERE integration_id = :id ${status ? "AND status = :status" : ""}
      ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
    { id, status: status ?? null, limit, offset: (page - 1) * limit },
  );
  return { events: rows.map(({ total, ...e }) => e), meta: { page, limit, total: rows[0]?.total ?? 0 } };
}

export async function retryEvent(ctx, id, eventId) {
  const integration = await loadIntegration(ctx, id);
  const event = await one(`SELECT * FROM integration_events WHERE id = :eventId AND integration_id = :id`, { eventId, id });
  if (!event) throw notFound("Event not found.");
  if (!event.payload_encrypted) throw conflict("The original payload is no longer stored, so it can't be replayed.");
  if (["processed", "duplicate"].includes(event.status)) throw conflict("This event already created a lead.");
  await exec(`UPDATE integration_events SET status = 'queued', updated_at = now() WHERE id = :eventId`, { eventId });
  await enqueue(QUEUES.INTEGRATION_PROCESS, { integrationId: integration.id, eventId, practiceId: ctx.practiceId });
}

// --- Facebook connect ---------------------------------------------------------

export function startFacebookOAuth(ctx) {
  if (!facebook.isConfigured()) throw conflict("Facebook isn't configured on this server (FACEBOOK_APP_ID/SECRET).");
  return { url: facebook.oauthUrl(signState({ practiceId: ctx.practiceId, userId: ctx.userId })) };
}

// Public callback. Returns the dashboard URL to redirect to.
export async function handleFacebookCallback(query) {
  const back = `${config.app_url}/settings/integrations`;
  try {
    const { practiceId, userId } = verifyState(query.state);
    if (!query.code) throw new Error(query.error_description || "Facebook didn't return an authorization code.");
    const bundle = await facebook.exchangeCode(query.code);
    if (!bundle.pages.length) throw new Error("No Facebook Pages are available for this account.");
    const session = await one(
      `INSERT INTO oauth_sessions (practice_id, user_id, provider_key, payload_encrypted, expires_at)
       VALUES (:practiceId, :userId, 'facebook_leads', :payload, now() + interval '15 minutes') RETURNING id`,
      { practiceId, userId, payload: encryptJson(bundle) },
    );
    return `${back}/facebook-leads/select-page?session=${session.id}`;
  } catch (error) {
    return `${back}?facebook_error=${encodeURIComponent(error.message)}`;
  }
}

async function loadSession(ctx, sessionId) {
  const session = await one(
    `SELECT * FROM oauth_sessions WHERE id = :sessionId AND provider_key = 'facebook_leads'`,
    { sessionId },
  );
  // Bound to the practice AND the user who started the flow.
  if (!session || session.practice_id !== ctx.practiceId || session.user_id !== ctx.userId) {
    throw notFound("Connection session not found. Please connect Facebook again.");
  }
  if (new Date(session.expires_at) < new Date()) throw conflict("This connection session expired. Please connect again.");
  return { session, bundle: decryptJson(session.payload_encrypted) };
}

export async function sessionPages(ctx, sessionId) {
  const { bundle } = await loadSession(ctx, sessionId);
  return bundle.pages.map(({ id, name }) => ({ id, name }));
}

export async function sessionForms(ctx, sessionId, pageId) {
  const { bundle } = await loadSession(ctx, sessionId);
  const page = bundle.pages.find((p) => p.id === pageId);
  if (!page) throw notFound("Page not found in this connection.");
  return facebook.listForms(page.id, page.access_token);
}

export async function finalizeFacebook(ctx, input) {
  const { session, bundle } = await loadSession(ctx, input.session);
  const page = bundle.pages.find((p) => p.id === input.page_id);
  if (!page) throw notFound("Page not found in this connection.");
  await validateTarget(ctx, input);
  await validateMapping(ctx, input.field_mapping);
  await facebook.subscribePage(page.id, page.access_token);
  const token = await facebook.inspectToken(page.access_token).catch(() => ({ expiresAt: null }));

  const existing = await one(
    `SELECT id FROM integrations WHERE practice_id = :p AND provider_key = 'facebook_leads' AND account_ref->>'page_id' = :pageId`,
    { p: ctx.practiceId, pageId: page.id },
  );
  const params = {
    practiceId: ctx.practiceId,
    clinicId: input.clinic_id ?? null,
    name: `Facebook: ${page.name}`,
    secrets: encryptJson({ page_access_token: page.access_token, user_token: bundle.userToken }),
    ref: JSON.stringify({
      page_id: page.id,
      page_name: page.name,
      form_ids: input.form_ids ?? [],
      forms: input.forms ?? [],
    }),
    pipelineId: input.default_pipeline_id,
    stageId: input.default_stage_id,
    mapping: JSON.stringify(input.field_mapping ?? {}),
    dedupe: input.dedupe_policy ?? "merge",
    expires: token.expiresAt,
    userId: ctx.userId,
  };
  const row = existing
    ? await one(
        `UPDATE integrations SET clinic_id = :clinicId, name = :name, secrets_encrypted = :secrets, account_ref = :ref::jsonb,
                default_pipeline_id = :pipelineId, default_stage_id = :stageId, field_mapping = :mapping::jsonb,
                dedupe_policy = :dedupe, token_expires_at = :expires, status = 'active', last_error = NULL,
                installed_by = :userId, updated_at = now()
          WHERE id = :id RETURNING *`,
        { ...params, id: existing.id },
      )
    : await one(
        `INSERT INTO integrations (practice_id, clinic_id, provider_key, name, secrets_encrypted, account_ref,
                                   default_pipeline_id, default_stage_id, field_mapping, dedupe_policy,
                                   token_expires_at, installed_by)
         VALUES (:practiceId, :clinicId, 'facebook_leads', :name, :secrets, :ref::jsonb, :pipelineId, :stageId,
                 :mapping::jsonb, :dedupe, :expires, :userId) RETURNING *`,
        params,
      );
  await exec(`DELETE FROM oauth_sessions WHERE id = :id`, { id: session.id });
  return toClient(row);
}

export async function syncNow(ctx, id) {
  const row = await loadIntegration(ctx, id);
  if (row.provider_key !== "facebook_leads") throw badRequest("Only Facebook integrations can be synced.");
  await enqueue(QUEUES.FB_PULL_SYNC, { integrationId: id, practiceId: ctx.practiceId });
}

export async function checkNow(ctx, id) {
  const row = await loadIntegration(ctx, id);
  if (row.provider_key !== "facebook_leads") throw badRequest("Only Facebook integrations have tokens to check.");
  const { checkFacebookToken } = await import("../../jobs/integration-handlers.js");
  await checkFacebookToken(row);
  return getIntegration(ctx, id);
}
