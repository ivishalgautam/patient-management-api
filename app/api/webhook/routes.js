"use strict";
import { select, one } from "../../db/sql.js";
import { logEvent } from "../../lib/integrations/ingest.js";
import * as facebook from "../../lib/integrations/providers/facebook-leads.js";
import { featureEnabled, getProvider } from "../../lib/integrations/registry.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";

// Public inbound webhooks: /v1/webhooks/...
// Deliveries are stored (redacted + encrypted) and acknowledged straight
// away; a queued job does the work, with retries. Providers retry hard on
// non-2xx, so anything that resolves to a real integration gets 200.

async function storeAndQueue(integration, payload, providerLeadId) {
  const event = await logEvent(integration, {
    direction: "inbound",
    status: "queued",
    providerLeadId: providerLeadId ? String(providerLeadId) : null,
    raw: payload,
  });
  await enqueue(QUEUES.INTEGRATION_PROCESS, {
    integrationId: integration.id,
    eventId: event.id,
    practiceId: integration.practice_id,
  });
  return event;
}

const byToken = (provider, token) =>
  one(
    `SELECT * FROM integrations WHERE provider_key = :provider AND webhook_token = :token AND status <> 'disabled'`,
    { provider, token },
  );

export default async function routes(fastify) {
  // Meta's one-time verification handshake.
  fastify.get("/facebook-leads", async (req, reply) => {
    const challenge = facebook.verifyChallenge(req.query);
    return challenge === null ? reply.code(403).send() : reply.type("text/plain").send(challenge);
  });

  fastify.post("/facebook-leads", { config: { rawBody: true, rateLimit: false } }, async (req, reply) => {
    if (!facebook.verifySignature(req.rawBody, req.headers["x-hub-signature-256"])) {
      req.log.warn("facebook webhook: bad signature");
      return reply.code(200).send({ status: false });
    }
    for (const n of facebook.extractNotifications(req.body)) {
      const integrations = await select(
        `SELECT * FROM integrations WHERE provider_key = 'facebook_leads' AND status <> 'disabled'
            AND account_ref->>'page_id' = :pageId`,
        { pageId: n.pageId },
      );
      for (const integration of integrations) {
        const formIds = integration.account_ref?.form_ids ?? [];
        if (formIds.length && n.formId && !formIds.includes(n.formId)) continue;
        await storeAndQueue(integration, n, n.leadgenId);
      }
    }
    return reply.code(200).send({ status: true });
  });

  // Generic JSON webhook (token in the URL).
  fastify.post("/custom/:token", async (req, reply) => {
    const integration = await byToken("custom_webhook", req.params.token);
    if (!integration) return reply.code(404).send();
    await storeAndQueue(integration, req.body ?? {});
    return reply.code(200).send({ status: true });
  });

  // Google Ads lead form webhook (add-on): token in URL + google_key in body.
  fastify.post("/google-ads/:token", async (req, reply) => {
    const integration = await byToken("google_ads_lead_form", req.params.token);
    if (!integration) return reply.code(404).send();
    const provider = getProvider("google_ads_lead_form");
    if (!(await featureEnabled(integration.practice_id, provider.feature, integration.clinic_id))) {
      return reply.code(404).send();
    }
    const { verifyGoogleKey } = await import("../../lib/integrations/providers/google-ads.js");
    if (!verifyGoogleKey(integration, req.body)) {
      await logEvent(integration, { direction: "inbound", status: "error", error: "google_key mismatch", keepRaw: false });
      return reply.code(403).send();
    }
    await storeAndQueue(integration, req.body, req.body?.lead_id);
    return reply.code(200).send({ status: true });
  });
}
