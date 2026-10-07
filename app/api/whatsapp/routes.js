"use strict";
import * as service from "./service.js";
import { verifyChallenge, verifySignature } from "../../lib/whatsapp/cloud-api.js";
import config from "../../config/index.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import {
  campaignInput,
  campaignQuery,
  conversationQuery,
  ensureInput,
  recipientQuery,
  retryInput,
  sendInput,
  settingsInput,
  startInput,
  templateInput,
  templateQuery,
} from "../../validation-schema/whatsapp.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/whatsapp (BW Task's WhatsApp API surface)
export default async function routes(fastify) {
  // settings (one number per practice)
  fastify.get("/settings", async (req, reply) => reply.ok(await service.getSettings(req.ctx)));
  fastify.put("/settings", async (req, reply) =>
    reply.ok(await service.saveSettings(req.ctx, settingsInput.parse(req.body)), { message: "WhatsApp connected." }),
  );
  fastify.delete("/settings", async (req, reply) => {
    await service.disconnect(req.ctx);
    return reply.ok(null, { message: "WhatsApp disconnected." });
  });

  // templates
  fastify.get("/templates", async (req, reply) => reply.ok(await service.listTemplates(req.ctx, templateQuery.parse(req.query ?? {}))));
  fastify.post("/templates", async (req, reply) =>
    reply.code(201).ok(await service.createTemplate(req.ctx, templateInput.parse(req.body)), {
      message: "Template submitted to Meta for review.",
    }),
  );
  fastify.post("/templates/sync", async (req, reply) => reply.ok(await service.syncTemplates(req.ctx)));
  fastify.delete("/templates/:id", async (req, reply) => {
    await service.deleteTemplate(req.ctx, id(req));
    return reply.ok(null, { message: "Template moved to Deleted." });
  });
  fastify.post("/templates/:id/restore", async (req, reply) => {
    await service.restoreTemplate(req.ctx, id(req));
    return reply.ok(null, { message: "Template restored." });
  });

  // conversations
  fastify.get("/conversations", async (req, reply) => {
    const { conversations, meta } = await service.listConversations(req.ctx, conversationQuery.parse(req.query ?? {}));
    return reply.ok(conversations, { meta });
  });
  fastify.post("/conversations/start", async (req, reply) =>
    reply.ok(await service.startConversation(req.ctx, startInput.parse(req.body)), { message: "Message sent." }),
  );
  fastify.post("/conversations/ensure", async (req, reply) => reply.ok(await service.ensureConversation(req.ctx, ensureInput.parse(req.body))));
  fastify.get("/conversations/:id", async (req, reply) => reply.ok(await service.getConversation(req.ctx, id(req))));
  fastify.get("/conversations/:id/messages", async (req, reply) => reply.ok(await service.getMessages(req.ctx, id(req))));
  fastify.post("/conversations/:id/messages", async (req, reply) =>
    reply.ok(await service.sendMessage(req.ctx, id(req), sendInput.parse(req.body))),
  );
  fastify.patch("/conversations/:id/unread", async (req, reply) => {
    await service.markUnread(req.ctx, id(req));
    return reply.ok(null);
  });
  fastify.delete("/conversations/:id", async (req, reply) => {
    await service.deleteConversation(req.ctx, id(req));
    return reply.ok(null, { message: "Chat deleted." });
  });
  fastify.get("/leads/:id/conversation", async (req, reply) => reply.ok(await service.leadConversation(req.ctx, id(req))));

  // campaigns
  fastify.get("/campaigns", async (req, reply) => {
    const { campaigns, meta } = await service.listCampaigns(req.ctx, campaignQuery.parse(req.query ?? {}));
    return reply.ok(campaigns, { meta });
  });
  fastify.post("/campaigns", async (req, reply) =>
    reply.code(201).ok(await service.createCampaign(req.ctx, campaignInput.parse(req.body)), { message: "Campaign created." }),
  );
  fastify.get("/campaigns/:id", async (req, reply) =>
    reply.ok(await service.getCampaign(req.ctx, id(req), recipientQuery.parse(req.query ?? {}))),
  );
  fastify.post("/campaigns/:id/start", async (req, reply) =>
    reply.ok(await service.startCampaign(req.ctx, id(req)), { message: "Campaign is sending." }),
  );
  fastify.post("/campaigns/:id/retry", async (req, reply) =>
    reply.ok(await service.retryCampaign(req.ctx, id(req), retryInput.parse(req.body ?? {})), { message: "Retrying failed messages." }),
  );
}

// Public: Meta's webhook for every practice's number (routed by
// metadata.phone_number_id). Signed with the app secret.
export async function whatsappWebhookRoutes(fastify) {
  fastify.get("/", async (req, reply) => {
    const challenge = verifyChallenge(req.query);
    return challenge === null ? reply.code(403).send() : reply.type("text/plain").send(challenge);
  });
  fastify.post("/", { config: { rawBody: true, rateLimit: false } }, async (req, reply) => {
    if (!verifySignature(req.rawBody, req.headers["x-hub-signature-256"])) {
      req.log.warn({ configured: !!config.whatsapp_cloud.app_secret }, "whatsapp webhook: bad or missing signature");
      return reply.code(401).send({ status: false });
    }
    try {
      await service.processWebhook(req.body);
    } catch (error) {
      // Logged without the payload (it carries patients' messages).
      req.log.error({ err: { message: error.message } }, "whatsapp webhook processing failed");
      return reply.code(500).send({ status: false });
    }
    return reply.code(200).send({ status: true });
  });
}
