"use strict";
import * as accounts from "./accounts.service.js";
import * as templates from "./templates.service.js";
import * as messages from "./messages.service.js";
import * as campaigns from "./campaigns.service.js";
import * as automation from "./automation.service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import * as s from "../../validation-schema/email.schema.js";

const id = (req) => uuidParam.parse(req.params).id;
const q = (schema, req) => schema.parse(req.query ?? {});

// Authenticated: /v1/email (BW Task's email module API surface)
export default async function routes(fastify) {
  // settings
  fastify.get("/settings", async (req, reply) => reply.ok(await accounts.getSettings(req.ctx)));
  fastify.put("/settings", async (req, reply) => reply.ok(await accounts.saveSettings(req.ctx, s.settingsInput.parse(req.body)), { message: "Email settings saved." }));

  // accounts (static paths before /:id)
  fastify.get("/accounts", async (req, reply) => reply.ok(await accounts.listAccounts(req.ctx)));
  fastify.post("/accounts", async (req, reply) =>
    reply.code(201).ok(await accounts.createAccount(req.ctx, s.accountInput.parse(req.body)), { message: "Email account connected." }),
  );
  fastify.post("/accounts/sync", async (req, reply) => {
    const result = await messages.syncNow(req.ctx, s.syncInput.parse(req.body ?? {}).account_id ?? null);
    return reply.ok(result, { message: result.fetched ? `${result.fetched} new email(s).` : "No new email." });
  });
  fastify.get("/accounts/:id", async (req, reply) => reply.ok(await accounts.getAccount(req.ctx, id(req))));
  fastify.put("/accounts/:id", async (req, reply) => reply.ok(await accounts.updateAccount(req.ctx, id(req), s.accountUpdate.parse(req.body)), { message: "Account saved." }));
  fastify.post("/accounts/:id/test", async (req, reply) => reply.ok(await accounts.testAccount(req.ctx, id(req)), { message: "Connection works." }));
  fastify.post("/accounts/:id/default", async (req, reply) => reply.ok(await accounts.setDefault(req.ctx, id(req)), { message: "Default account changed." }));
  fastify.delete("/accounts/:id", async (req, reply) => {
    await accounts.deleteAccount(req.ctx, id(req));
    return reply.ok(null, { message: "Account removed." });
  });

  // templates
  fastify.get("/templates/meta", async (req, reply) => reply.ok(templates.templateMeta()));
  fastify.post("/templates/preview", async (req, reply) => reply.ok(await templates.previewDraft(req.ctx, s.draftPreviewInput.parse(req.body))));
  fastify.get("/templates", async (req, reply) => reply.ok(await templates.listTemplates(req.ctx, q(s.templateQuery, req))));
  fastify.post("/templates", async (req, reply) =>
    reply.code(201).ok(await templates.createTemplate(req.ctx, s.templateInput.parse(req.body)), { message: "Template saved." }),
  );
  fastify.get("/templates/:id", async (req, reply) => reply.ok(await templates.getTemplate(req.ctx, id(req))));
  fastify.put("/templates/:id", async (req, reply) => reply.ok(await templates.updateTemplate(req.ctx, id(req), s.templateUpdate.parse(req.body)), { message: "Template saved." }));
  fastify.post("/templates/:id/duplicate", async (req, reply) => reply.code(201).ok(await templates.duplicateTemplate(req.ctx, id(req)), { message: "Template copied." }));
  fastify.get("/templates/:id/preview", async (req, reply) => reply.ok(await templates.previewTemplate(req.ctx, id(req), q(s.previewQuery, req))));
  fastify.delete("/templates/:id", async (req, reply) => {
    await templates.deleteTemplate(req.ctx, id(req));
    return reply.ok(null, { message: "Template deleted." });
  });

  // messages
  fastify.get("/messages", async (req, reply) => {
    const { messages: rows, meta } = await messages.listMessages(req.ctx, q(s.messageQuery, req));
    return reply.ok(rows, { meta });
  });
  fastify.post("/messages", async (req, reply) => reply.code(201).ok(await messages.sendEmail(req.ctx, s.sendInput.parse(req.body)), { message: "Email is being sent." }));
  fastify.get("/messages/:id", async (req, reply) => reply.ok(await messages.getMessage(req.ctx, id(req))));
  fastify.post("/messages/:id/reply", async (req, reply) => reply.code(201).ok(await messages.replyTo(req.ctx, id(req), s.replyInput.parse(req.body)), { message: "Reply is being sent." }));
  fastify.post("/messages/:id/move", async (req, reply) => reply.ok(await messages.moveMessage(req.ctx, id(req), s.moveInput.parse(req.body))));
  fastify.post("/messages/:id/read", async (req, reply) => reply.ok(await messages.markRead(req.ctx, id(req), s.readInput.parse(req.body))));
  fastify.post("/messages/:id/retry", async (req, reply) => reply.ok(await messages.retryMessage(req.ctx, id(req)), { message: "Retrying." }));
  fastify.delete("/messages/:id", async (req, reply) => {
    await messages.deleteMessage(req.ctx, id(req));
    return reply.ok(null, { message: "Deleted." });
  });

  // campaigns
  fastify.post("/campaigns/audience", async (req, reply) => reply.ok(await campaigns.audiencePreview(req.ctx, s.audienceInput.parse(req.body))));
  fastify.get("/campaigns", async (req, reply) => reply.ok(await campaigns.listCampaigns(req.ctx)));
  fastify.post("/campaigns", async (req, reply) =>
    reply.code(201).ok(await campaigns.createCampaign(req.ctx, s.campaignInput.parse(req.body)), { message: "Campaign saved as a draft." }),
  );
  fastify.get("/campaigns/:id", async (req, reply) => reply.ok(await campaigns.getCampaign(req.ctx, id(req))));
  fastify.put("/campaigns/:id", async (req, reply) => reply.ok(await campaigns.updateCampaign(req.ctx, id(req), s.campaignUpdate.parse(req.body)), { message: "Campaign saved." }));
  fastify.delete("/campaigns/:id", async (req, reply) => {
    await campaigns.deleteCampaign(req.ctx, id(req));
    return reply.ok(null, { message: "Campaign deleted." });
  });
  fastify.post("/campaigns/:id/recipients", async (req, reply) => {
    const result = await campaigns.uploadRecipients(req.ctx, id(req), s.uploadInput.parse(req.body));
    return reply.ok(result, { message: `${result.added} recipient(s) added.` });
  });
  fastify.get("/campaigns/:id/recipients", async (req, reply) => reply.ok(await campaigns.listRecipients(req.ctx, id(req), q(s.recipientQuery, req))));
  fastify.post("/campaigns/:id/send-now", async (req, reply) => reply.ok(await campaigns.sendNow(req.ctx, id(req)), { message: "Campaign is sending." }));
  fastify.post("/campaigns/:id/schedule", async (req, reply) => reply.ok(await campaigns.schedule(req.ctx, id(req), s.scheduleInput.parse(req.body)), { message: "Campaign scheduled." }));
  fastify.post("/campaigns/:id/cancel", async (req, reply) => reply.ok(await campaigns.cancel(req.ctx, id(req)), { message: "Campaign cancelled." }));

  // automation
  fastify.get("/automation/triggers", async (req, reply) => reply.ok(automation.TRIGGERS));
  fastify.get("/automation/runs", async (req, reply) => {
    const { runs, meta } = await automation.listRuns(req.ctx, q(s.runQuery, req));
    return reply.ok(runs, { meta });
  });
  fastify.get("/automation", async (req, reply) => reply.ok(await automation.listRules(req.ctx)));
  fastify.post("/automation", async (req, reply) => reply.code(201).ok(await automation.createRule(req.ctx, s.ruleInput.parse(req.body)), { message: "Automation saved." }));
  fastify.get("/automation/:id", async (req, reply) => reply.ok(await automation.getRule(req.ctx, id(req))));
  fastify.put("/automation/:id", async (req, reply) => reply.ok(await automation.updateRule(req.ctx, id(req), s.ruleUpdate.parse(req.body)), { message: "Automation saved." }));
  fastify.delete("/automation/:id", async (req, reply) => {
    await automation.deleteRule(req.ctx, id(req));
    return reply.ok(null, { message: "Automation deleted." });
  });
}
