"use strict";
import config from "../../config/index.js";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { AppError, badRequest, conflict, notFound } from "../../lib/app-error.js";
import { decryptJson, encryptJson } from "../../lib/integrations/secrets.js";
import { normalizePhone } from "../../lib/leads/normalize.js";
import { client, CloudApiError } from "../../lib/whatsapp/cloud-api.js";
import {
  buildComponentsFromVariables,
  countBodyVariables,
  extractMessageText,
  mediaOf,
  renderTemplateBodyText,
} from "../../lib/whatsapp/components.js";
import { createLead, systemContext } from "../lead/service.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";

// WhatsApp Cloud API module (BW Task's WhatsApp module on this platform):
// one number per practice, templates, a shared inbox with Meta's 24-hour
// customer-service window, broadcast campaigns and the inbound webhook.

const WINDOW_MS = 24 * 60 * 60 * 1000;
// Meta error codes that mean "Meta limited this send" (per-user marketing
// limit, throughput) rather than a problem with the number or template.
export const LIMITED_BY_META = [131049, 131048, 130429, 131056];
const STATUS_RANK = { queued: 0, sent: 1, delivered: 2, read: 3 };

// Phone as Meta uses it: digits with country code, no "+".
export const toWaId = (phone) => {
  const e164 = normalizePhone(phone);
  return e164 ? e164.slice(1) : String(phone ?? "").replace(/\D/g, "") || null;
};
const sendFailed = (error) =>
  new AppError(400, error.message || "WhatsApp couldn't send the message.", {
    code: "WHATSAPP_SEND_FAILED",
    details: error.details,
  });

// --- account ------------------------------------------------------------------

async function loadAccount(practiceId, { required = true } = {}) {
  const row = await one(`SELECT * FROM whatsapp_accounts WHERE practice_id = :practiceId`, { practiceId });
  if (!row) {
    if (!required) return null;
    throw new AppError(409, "Connect a WhatsApp number in Settings > WhatsApp first.", { code: "WHATSAPP_NOT_CONNECTED" });
  }
  return { ...row, access_token: decryptJson(row.access_token_encrypted)?.token };
}

async function activeAccount(practiceId) {
  const account = await loadAccount(practiceId);
  if (!account.is_active) throw new AppError(409, "WhatsApp is switched off for this practice.", { code: "WHATSAPP_INACTIVE" });
  return account;
}

const publicAccount = (row) => {
  if (!row) return null;
  const { access_token_encrypted, access_token, ...rest } = row;
  return { ...rest, has_access_token: !!access_token_encrypted };
};

export async function getSettings(ctx) {
  const account = await one(`SELECT * FROM whatsapp_accounts WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId });
  return {
    account: publicAccount(account),
    webhook_url: `${config.api_url}/webhooks/whatsapp`,
    verify_token_configured: !!config.whatsapp_cloud.webhook_verify_token,
    app_secret_configured: !!config.whatsapp_cloud.app_secret,
  };
}

export async function saveSettings(ctx, input) {
  const existing = await one(`SELECT * FROM whatsapp_accounts WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId });
  const token = input.access_token || (existing ? decryptJson(existing.access_token_encrypted)?.token : null);
  if (!token) throw badRequest("Enter the access token for this WhatsApp number.");
  if (input.default_stage_id) {
    const stage = await one(
      `SELECT pipeline_id FROM pipeline_stages WHERE id = :id AND practice_id = :practiceId AND archived_at IS NULL`,
      { id: input.default_stage_id, practiceId: ctx.practiceId },
    );
    if (!stage || (input.default_pipeline_id && stage.pipeline_id !== input.default_pipeline_id)) {
      throw badRequest("Stage not found in this pipeline.");
    }
  }
  const taken = await one(
    `SELECT 1 FROM whatsapp_accounts WHERE phone_number_id = :id AND practice_id <> :practiceId`,
    { id: input.phone_number_id, practiceId: ctx.practiceId },
  );
  if (taken) throw conflict("This WhatsApp number is already connected to another practice.");

  // Check the credentials before saving them.
  let number;
  try {
    number = await client({ ...input, access_token: token }).getPhoneNumber();
  } catch (error) {
    throw new AppError(400, `Meta rejected these details: ${error.message}`, { code: "WHATSAPP_CREDENTIALS" });
  }

  await exec(
    `INSERT INTO whatsapp_accounts (practice_id, phone_number_id, waba_id, display_phone_number, verified_name,
                                    access_token_encrypted, is_active, create_leads_from_inbound,
                                    default_pipeline_id, default_stage_id, last_error, created_by)
     VALUES (:practiceId, :phoneNumberId, :wabaId, :display, :name, :token, :active, :createLeads, :pipelineId, :stageId, NULL, :userId)
     ON CONFLICT (practice_id) DO UPDATE SET
       phone_number_id = EXCLUDED.phone_number_id, waba_id = EXCLUDED.waba_id,
       display_phone_number = EXCLUDED.display_phone_number, verified_name = EXCLUDED.verified_name,
       access_token_encrypted = EXCLUDED.access_token_encrypted, is_active = EXCLUDED.is_active,
       create_leads_from_inbound = EXCLUDED.create_leads_from_inbound,
       default_pipeline_id = EXCLUDED.default_pipeline_id, default_stage_id = EXCLUDED.default_stage_id,
       last_error = NULL, updated_at = now()`,
    {
      practiceId: ctx.practiceId,
      phoneNumberId: input.phone_number_id,
      wabaId: input.waba_id,
      display: number?.display_phone_number ?? null,
      name: number?.verified_name ?? null,
      token: encryptJson({ token }),
      active: input.is_active ?? true,
      createLeads: input.create_leads_from_inbound ?? true,
      pipelineId: input.default_pipeline_id ?? null,
      stageId: input.default_stage_id ?? null,
      userId: ctx.userId ?? null,
    },
  );
  return getSettings(ctx);
}

export async function disconnect(ctx) {
  await exec(`DELETE FROM whatsapp_accounts WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId });
}

// --- templates ----------------------------------------------------------------

export function listTemplates(ctx, { status, category, deleted = false } = {}) {
  return select(
    `SELECT * FROM whatsapp_templates
      WHERE practice_id = :practiceId
        AND ${deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"}
        AND (:status::text IS NULL OR status::text = :status)
        AND (:category::text IS NULL OR category::text = :category)
      ORDER BY created_at DESC`,
    { practiceId: ctx.practiceId, status: status ?? null, category: category ?? null },
  );
}

async function loadTemplate(ctx, id) {
  const row = await one(`SELECT * FROM whatsapp_templates WHERE id = :id AND practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Template not found.");
  return row;
}

export async function createTemplate(ctx, input) {
  const account = await activeAccount(ctx.practiceId);
  const dup = await one(
    `SELECT 1 FROM whatsapp_templates WHERE practice_id = :practiceId AND name = :name AND language = :language`,
    { practiceId: ctx.practiceId, name: input.name, language: input.language },
  );
  if (dup) throw conflict("A template with this name and language already exists.");
  let meta;
  try {
    meta = await client(account).createTemplate(input);
  } catch (error) {
    throw new AppError(400, error.message, { code: "WHATSAPP_TEMPLATE_REJECTED", details: error.details });
  }
  return one(
    `INSERT INTO whatsapp_templates (practice_id, meta_template_id, name, category, language, parameter_format,
                                     status, components, created_by)
     VALUES (:practiceId, :metaId, :name, :category, :language, :format, :status, :components::jsonb, :userId)
     RETURNING *`,
    {
      practiceId: ctx.practiceId,
      metaId: meta?.id ?? null,
      name: input.name,
      category: meta?.category ?? input.category,
      language: input.language,
      format: input.parameter_format,
      status: ["APPROVED", "REJECTED", "PENDING", "PAUSED", "DISABLED"].includes(meta?.status) ? meta.status : "PENDING",
      components: JSON.stringify(input.components),
      userId: ctx.userId ?? null,
    },
  );
}

const TEMPLATE_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"]);
const CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);

export async function syncTemplates(ctx) {
  const account = await activeAccount(ctx.practiceId);
  let remote;
  try {
    remote = await client(account).listTemplates();
  } catch (error) {
    throw new AppError(400, error.message, { code: "WHATSAPP_SYNC_FAILED" });
  }
  for (const t of remote) {
    await exec(
      `INSERT INTO whatsapp_templates (practice_id, meta_template_id, name, category, language, parameter_format,
                                       status, rejection_reason, components)
       VALUES (:practiceId, :metaId, :name, :category, :language, :format, :status, :reason, :components::jsonb)
       ON CONFLICT (practice_id, name, language) DO UPDATE SET
         meta_template_id = EXCLUDED.meta_template_id, category = EXCLUDED.category, status = EXCLUDED.status,
         rejection_reason = EXCLUDED.rejection_reason, components = EXCLUDED.components,
         parameter_format = EXCLUDED.parameter_format, updated_at = now()`,
      {
        practiceId: ctx.practiceId,
        metaId: t.id,
        name: t.name,
        category: CATEGORIES.has(t.category) ? t.category : "UTILITY",
        language: t.language,
        format: (t.parameter_format || "POSITIONAL").toLowerCase(),
        status: TEMPLATE_STATUSES.has(t.status) ? t.status : "PENDING",
        reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
        components: JSON.stringify(t.components ?? []),
      },
    );
  }
  return { synced: remote.length };
}

export async function deleteTemplate(ctx, id) {
  await loadTemplate(ctx, id);
  await exec(`UPDATE whatsapp_templates SET deleted_at = now(), updated_at = now() WHERE id = :id`, { id });
}

export async function restoreTemplate(ctx, id) {
  await loadTemplate(ctx, id);
  await exec(`UPDATE whatsapp_templates SET deleted_at = NULL, updated_at = now() WHERE id = :id`, { id });
}

// --- conversations ------------------------------------------------------------

const CONVERSATION_COLUMNS = `
  c.id, c.lead_id, c.phone, c.contact_name, c.last_customer_message_at, c.last_message_at,
  c.last_message_preview, c.unread_count, c.created_at,
  l.full_name AS lead_name, l.owner_id, u.fullname AS owner_name, s.name AS stage_name, s.color AS stage_color`;
const CONVERSATION_FROM = `
  FROM whatsapp_conversations c
  LEFT JOIN leads l ON l.id = c.lead_id AND l.deleted_at IS NULL
  LEFT JOIN users u ON u.id = l.owner_id
  LEFT JOIN pipeline_stages s ON s.id = l.stage_id`;

export async function listConversations(ctx, { filter = "all", q, page = 1, limit = 50 }) {
  const rows = await select(
    `SELECT ${CONVERSATION_COLUMNS}, count(*) OVER()::int AS total ${CONVERSATION_FROM}
      WHERE c.practice_id = :practiceId
        ${filter === "unread" ? "AND c.unread_count > 0" : filter === "read" ? "AND c.unread_count = 0" : ""}
        AND (:q::text IS NULL OR lower(coalesce(l.full_name, c.contact_name, '')) LIKE :q OR c.phone LIKE :qDigits
             OR lower(coalesce(c.last_message_preview, '')) LIKE :q)
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT :limit OFFSET :offset`,
    {
      practiceId: ctx.practiceId,
      q: q ? `%${q.toLowerCase()}%` : null,
      qDigits: `%${(q ?? "").replace(/\D/g, "") || "__none__"}%`,
      limit,
      offset: (page - 1) * limit,
    },
  );
  const unread = await one(
    `SELECT count(*)::int AS n FROM whatsapp_conversations WHERE practice_id = :practiceId AND unread_count > 0`,
    { practiceId: ctx.practiceId },
  );
  return {
    conversations: rows.map(({ total, ...c }) => withWindow(c)),
    meta: { page, limit, total: rows[0]?.total ?? 0, unread_conversations: unread.n },
  };
}

const withWindow = (c) => ({
  ...c,
  within_window: !!c.last_customer_message_at && Date.now() - new Date(c.last_customer_message_at).getTime() < WINDOW_MS,
});

async function loadConversation(ctx, id) {
  const row = await one(`SELECT ${CONVERSATION_COLUMNS} ${CONVERSATION_FROM} WHERE c.id = :id AND c.practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Conversation not found.");
  return withWindow(row);
}

export const getConversation = (ctx, id) => loadConversation(ctx, id);

export async function getMessages(ctx, id, { before, limit = 100 } = {}) {
  await loadConversation(ctx, id);
  const rows = await select(
    `SELECT m.*, u.fullname AS sent_by_name FROM whatsapp_messages m
       LEFT JOIN users u ON u.id = m.sent_by
      WHERE m.conversation_id = :id AND (:before::timestamptz IS NULL OR m.created_at < :before::timestamptz)
      ORDER BY m.created_at DESC LIMIT :limit`,
    { id, before: before ?? null, limit },
  );
  await exec(`UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = :id AND unread_count > 0`, { id });
  return rows.reverse();
}

// Find or create the thread for a phone, linking the practice's lead with
// that number when there is one.
async function ensureConversationRow(practiceId, phone, { leadId = null, name = null, transaction } = {}) {
  const waId = toWaId(phone);
  if (!waId) throw badRequest("A valid phone number is required.");
  let lead = leadId;
  if (!lead) {
    const match = await one(
      `SELECT id FROM leads WHERE practice_id = :practiceId AND phone_normalized = :e164 AND deleted_at IS NULL
        ORDER BY (status = 'open') DESC, created_at DESC LIMIT 1`,
      { practiceId, e164: `+${waId}` },
      { transaction },
    );
    lead = match?.id ?? null;
  }
  return one(
    `INSERT INTO whatsapp_conversations (practice_id, phone, lead_id, contact_name)
     VALUES (:practiceId, :phone, :leadId, :name)
     ON CONFLICT (practice_id, phone) DO UPDATE SET
       lead_id = coalesce(whatsapp_conversations.lead_id, EXCLUDED.lead_id),
       contact_name = coalesce(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
       updated_at = now()
     RETURNING *`,
    { practiceId, phone: waId, leadId: lead, name },
    { transaction },
  );
}

async function leadFor(ctx, leadId) {
  const lead = await one(
    `SELECT id, full_name, phone FROM leads WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`,
    { id: leadId, practiceId: ctx.practiceId },
  );
  if (!lead) throw notFound("Lead not found.");
  if (!lead.phone) throw badRequest("This lead has no phone number.");
  return lead;
}

export async function ensureConversation(ctx, { lead_id: leadId, phone }) {
  const lead = leadId ? await leadFor(ctx, leadId) : null;
  const row = await ensureConversationRow(ctx.practiceId, phone ?? lead?.phone, { leadId: lead?.id, name: lead?.full_name });
  return loadConversation(ctx, row.id);
}

async function recordOutbound(practiceId, conversationId, { wamid, type, body, templateName = null, userId = null }) {
  const message = await one(
    `INSERT INTO whatsapp_messages (practice_id, conversation_id, wamid, direction, type, body, status, template_name, sent_by)
     VALUES (:practiceId, :conversationId, :wamid, 'out', :type, :body, 'sent', :templateName, :userId)
     RETURNING *`,
    { practiceId, conversationId, wamid, type, body, templateName, userId },
  );
  await exec(
    `UPDATE whatsapp_conversations SET last_message_at = now(), last_message_preview = left(:body, 300), updated_at = now()
      WHERE id = :conversationId`,
    { conversationId, body: body ?? "" },
  );
  return message;
}

async function approvedTemplate(ctx, templateId) {
  const template = await one(
    `SELECT * FROM whatsapp_templates WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`,
    { id: templateId, practiceId: ctx.practiceId },
  );
  if (!template) throw notFound("Template not found.");
  if (template.status !== "APPROVED") throw badRequest("This template isn't approved by Meta yet.");
  return template;
}

const templatePayload = (to, template, variables) => ({
  to,
  type: "template",
  template: {
    name: template.name,
    language: { code: template.language },
    components: buildComponentsFromVariables(template.components, variables),
  },
});

// Free text only inside the 24-hour window after the customer's last
// message; otherwise an approved template (Meta's rule).
export async function sendMessage(ctx, conversationId, { text, template_id: templateId, variables = {} }) {
  const conversation = await loadConversation(ctx, conversationId);
  const account = await activeAccount(ctx.practiceId);
  let payload;
  let preview;
  let type;
  let templateName = null;
  if (text && conversation.within_window) {
    payload = { to: conversation.phone, type: "text", text: { body: text, preview_url: true } };
    preview = text;
    type = "text";
  } else if (templateId) {
    const template = await approvedTemplate(ctx, templateId);
    payload = templatePayload(conversation.phone, template, variables);
    preview = renderTemplateBodyText(template.components, variables) || `[template: ${template.name}]`;
    type = "template";
    templateName = template.name;
  } else {
    throw new AppError(400, "More than 24 hours since the customer's last message — send an approved template to reopen the chat.", {
      code: "WHATSAPP_WINDOW_CLOSED",
    });
  }
  let meta;
  try {
    meta = await client(account).sendMessage(payload);
  } catch (error) {
    throw sendFailed(error);
  }
  return recordOutbound(ctx.practiceId, conversation.id, {
    wamid: meta?.messages?.[0]?.id ?? null,
    type,
    body: preview,
    templateName,
    userId: ctx.userId,
  });
}

// New conversation from a template (to a lead or a phone number).
export async function startConversation(ctx, { lead_id: leadId, phone, template_id: templateId, variables = {} }) {
  const conversation = await ensureConversation(ctx, { lead_id: leadId, phone });
  const message = await sendMessage(ctx, conversation.id, { template_id: templateId, variables });
  return { conversation: await loadConversation(ctx, conversation.id), message };
}

export async function markUnread(ctx, id) {
  await loadConversation(ctx, id);
  await exec(`UPDATE whatsapp_conversations SET unread_count = greatest(unread_count, 1) WHERE id = :id`, { id });
}

export async function deleteConversation(ctx, id) {
  await loadConversation(ctx, id);
  await exec(`DELETE FROM whatsapp_conversations WHERE id = :id`, { id });
}

export async function leadConversation(ctx, leadId) {
  const lead = await one(`SELECT id, phone FROM leads WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`, {
    id: leadId,
    practiceId: ctx.practiceId,
  });
  if (!lead) throw notFound("Lead not found.");
  const waId = toWaId(lead.phone);
  const row = await one(
    `SELECT id FROM whatsapp_conversations WHERE practice_id = :practiceId AND (lead_id = :leadId OR phone = :phone)
      ORDER BY (lead_id = :leadId) DESC LIMIT 1`,
    { practiceId: ctx.practiceId, leadId, phone: waId ?? "__none__" },
  );
  return row ? loadConversation(ctx, row.id) : null;
}

// --- webhook ------------------------------------------------------------------

// Processes one webhook delivery. Meta delivers at least once, so every
// write is idempotent (wamid unique, status only moves forward).
export async function processWebhook(body) {
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (change.field === "message_template_status_update") {
        await exec(
          `UPDATE whatsapp_templates t SET status = :status, rejection_reason = :reason, updated_at = now()
             FROM whatsapp_accounts a
            WHERE a.practice_id = t.practice_id AND a.waba_id = :wabaId AND t.meta_template_id = :metaId`,
          {
            wabaId: String(entry.id ?? ""),
            metaId: String(value.message_template_id ?? ""),
            status: TEMPLATE_STATUSES.has(value.event) ? value.event : "PENDING",
            reason: value.reason && value.reason !== "NONE" ? value.reason : null,
          },
        );
        continue;
      }
      if (change.field !== "messages") continue;
      const account = await one(`SELECT * FROM whatsapp_accounts WHERE phone_number_id = :id AND is_active`, {
        id: String(value.metadata?.phone_number_id ?? ""),
      });
      if (!account) continue;
      await exec(`UPDATE whatsapp_accounts SET last_webhook_at = now() WHERE id = :id`, { id: account.id });
      const names = Object.fromEntries((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const msg of value.messages ?? []) await handleInbound(account, msg, names[msg.from] ?? null);
      for (const status of value.statuses ?? []) await handleStatus(account, status);
    }
  }
}

async function handleInbound(account, msg, name) {
  const practiceId = account.practice_id;
  const known = await one(`SELECT 1 FROM whatsapp_messages WHERE wamid = :wamid`, { wamid: msg.id });
  if (known) return;
  const text = extractMessageText(msg);
  const media = mediaOf(msg);
  const at = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

  let conversation = await ensureConversationRow(practiceId, `+${msg.from}`, { name });
  if (!conversation.lead_id && account.create_leads_from_inbound) {
    try {
      const result = await createLead(
        systemContext(practiceId),
        {
          full_name: name || `+${msg.from}`,
          phone: `+${msg.from}`,
          source: "WhatsApp",
          pipeline_id: account.default_pipeline_id ?? undefined,
          stage_id: account.default_stage_id ?? undefined,
        },
        {
          dedupe: "merge",
          assignment: "round_robin",
          via: { type: "whatsapp", activityType: "whatsapp", body: `WhatsApp: ${text}`.slice(0, 1000) },
        },
      );
      conversation = await one(
        `UPDATE whatsapp_conversations SET lead_id = :leadId, updated_at = now() WHERE id = :id RETURNING *`,
        { id: conversation.id, leadId: result.lead.id },
      );
    } catch (error) {
      // The message is still recorded; the lead can be created from the inbox.
      await exec(`UPDATE whatsapp_accounts SET last_error = :e WHERE id = :id`, {
        id: account.id,
        e: `Couldn't create a lead from a WhatsApp message: ${error.message}`,
      });
    }
  }

  const inserted = await one(
    `INSERT INTO whatsapp_messages (practice_id, conversation_id, wamid, direction, type, body, status,
                                    media_id, media_type, media_filename, created_at)
     VALUES (:practiceId, :conversationId, :wamid, 'in', :type, :body, 'delivered', :mediaId, :mediaType, :mediaFilename, :at)
     ON CONFLICT (wamid) DO NOTHING RETURNING id`,
    {
      practiceId,
      conversationId: conversation.id,
      wamid: msg.id,
      type: msg.type,
      body: text,
      mediaId: media.media_id ?? null,
      mediaType: media.media_type ?? null,
      mediaFilename: media.media_filename ?? null,
      at,
    },
  );
  if (!inserted) return;
  await exec(
    `UPDATE whatsapp_conversations SET last_customer_message_at = greatest(coalesce(last_customer_message_at, :at), :at),
            last_message_at = greatest(coalesce(last_message_at, :at), :at), last_message_preview = left(:body, 300),
            unread_count = unread_count + 1, updated_at = now()
      WHERE id = :id`,
    { id: conversation.id, at, body: text },
  );
  if (conversation.lead_id) {
    await exec(`UPDATE leads SET last_activity_at = now() WHERE id = :id`, { id: conversation.lead_id });
  }
  // Campaign "Replied": the latest campaign message to this phone.
  const recipient = await one(
    `UPDATE whatsapp_campaign_recipients SET status = 'replied', replied_at = :at
      WHERE id = (SELECT id FROM whatsapp_campaign_recipients
                   WHERE practice_id = :practiceId AND phone = :phone AND status IN ('sent', 'delivered', 'read')
                   ORDER BY sent_at DESC NULLS LAST LIMIT 1)
      RETURNING campaign_id`,
    { practiceId, phone: msg.from, at },
  );
  if (recipient) {
    await exec(`UPDATE whatsapp_campaigns SET replied_count = replied_count + 1, updated_at = now() WHERE id = :id`, {
      id: recipient.campaign_id,
    });
  }
}

async function handleStatus(account, status) {
  const next = status.status;
  const error = status.errors?.[0];
  const message = await one(`SELECT id, status FROM whatsapp_messages WHERE wamid = :wamid`, { wamid: status.id });
  if (message && (next === "failed" || (STATUS_RANK[next] ?? -1) > (STATUS_RANK[message.status] ?? -1))) {
    await exec(`UPDATE whatsapp_messages SET status = :status, error_message = :error, updated_at = now() WHERE id = :id`, {
      id: message.id,
      status: next,
      error: error ? `${error.title ?? "Failed"}${error.code ? ` (${error.code})` : ""}` : null,
    });
  }

  const recipient = await one(
    `SELECT id, campaign_id, status FROM whatsapp_campaign_recipients WHERE wamid = :wamid AND practice_id = :practiceId`,
    { wamid: status.id, practiceId: account.practice_id },
  );
  if (!recipient) return;
  const counters = [];
  if (next === "failed" && recipient.status !== "failed") {
    await exec(
      `UPDATE whatsapp_campaign_recipients SET status = 'failed', error_message = :msg, error_code = :code WHERE id = :id`,
      { id: recipient.id, msg: error?.title ?? "Failed", code: error?.code ?? null },
    );
    counters.push("failed_count");
  } else if (["delivered", "read"].includes(next) && ["sent", "delivered"].includes(recipient.status)) {
    const target = STATUS_RANK[next] > STATUS_RANK[recipient.status] ? next : recipient.status;
    if (recipient.status === "sent") counters.push("delivered_count");
    if (next === "read") counters.push("read_count");
    await exec(
      `UPDATE whatsapp_campaign_recipients SET status = :status,
              delivered_at = coalesce(delivered_at, now()), read_at = CASE WHEN :read THEN coalesce(read_at, now()) ELSE read_at END
        WHERE id = :id`,
      { id: recipient.id, status: target, read: next === "read" },
    );
  } else if (next === "read" && recipient.status === "replied") {
    // replied already implies read; nothing to count
  }
  for (const column of counters) {
    await exec(`UPDATE whatsapp_campaigns SET ${column} = ${column} + 1, updated_at = now() WHERE id = :id`, {
      id: recipient.campaign_id,
    });
  }
}

// --- campaigns ----------------------------------------------------------------

const CAMPAIGN_COLUMNS = `
  c.*, t.name AS template_name, t.category AS template_category, t.status AS template_status,
  t.language AS template_language, t.components AS template_components,
  (SELECT count(*)::int FROM whatsapp_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'failed'
      AND r.error_code IN (:limited)) AS limited_by_meta_count,
  (SELECT count(*)::int FROM whatsapp_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'failed'
      AND (r.error_code IS NULL OR r.error_code NOT IN (:limited))) AS other_failures_count`;

export async function listCampaigns(ctx, { page = 1, limit = 20 } = {}) {
  const rows = await select(
    `SELECT ${CAMPAIGN_COLUMNS}, count(*) OVER()::int AS total
       FROM whatsapp_campaigns c JOIN whatsapp_templates t ON t.id = c.template_id
      WHERE c.practice_id = :practiceId ORDER BY c.created_at DESC LIMIT :limit OFFSET :offset`,
    { practiceId: ctx.practiceId, limited: LIMITED_BY_META, limit, offset: (page - 1) * limit },
  );
  return { campaigns: rows.map(({ total, ...c }) => c), meta: { page, limit, total: rows[0]?.total ?? 0 } };
}

async function loadCampaign(ctx, id) {
  const row = await one(
    `SELECT ${CAMPAIGN_COLUMNS} FROM whatsapp_campaigns c JOIN whatsapp_templates t ON t.id = c.template_id
      WHERE c.id = :id AND c.practice_id = :practiceId`,
    { id, practiceId: ctx.practiceId, limited: LIMITED_BY_META },
  );
  if (!row) throw notFound("Campaign not found.");
  return row;
}

export async function getCampaign(ctx, id, { status } = {}) {
  const campaign = await loadCampaign(ctx, id);
  const recipients = await select(
    `SELECT r.id, r.lead_id, r.phone, r.name, r.status, r.error_message, r.error_code,
            r.sent_at, r.delivered_at, r.read_at, r.replied_at
       FROM whatsapp_campaign_recipients r
      WHERE r.campaign_id = :id AND (:status::text IS NULL OR r.status::text = :status)
      ORDER BY r.name NULLS LAST, r.phone LIMIT 1000`,
    { id, status: status ?? null },
  );
  const pipelineName = campaign.audience_filter?.pipeline_id
    ? (await one(`SELECT name FROM pipelines WHERE id = :id`, { id: campaign.audience_filter.pipeline_id }))?.name
    : null;
  return { ...campaign, pipeline_name: pipelineName, recipients };
}

export async function createCampaign(ctx, { name, template_id: templateId, audience_filter: audience = {}, variable_mapping }) {
  const template = await one(
    `SELECT * FROM whatsapp_templates WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`,
    { id: templateId, practiceId: ctx.practiceId },
  );
  if (!template) throw notFound("Template not found.");
  const required = countBodyVariables(template.components);
  const mapping = Array.isArray(variable_mapping) ? variable_mapping : [];
  if (mapping.length !== required) {
    throw badRequest(
      required
        ? `This template has ${required} variable(s) in its body. Give each one a value or "recipient's name".`
        : "This template has no body variables.",
    );
  }
  if (mapping.some((slot) => slot.source === "static" && !String(slot.value ?? "").trim())) {
    throw badRequest("Every fixed variable needs a value.");
  }
  if (!audience.pipeline_id) throw badRequest("Choose the pipeline whose leads should receive this campaign.");

  return withTransaction(async (transaction) => {
    const campaign = await one(
      `INSERT INTO whatsapp_campaigns (practice_id, name, template_id, audience_filter, variable_mapping, created_by)
       VALUES (:practiceId, :name, :templateId, :audience::jsonb, :mapping::jsonb, :userId) RETURNING *`,
      {
        practiceId: ctx.practiceId,
        name,
        templateId,
        audience: JSON.stringify({ pipeline_id: audience.pipeline_id, stage_ids: audience.stage_ids ?? [], status: audience.status ?? "open" }),
        mapping: JSON.stringify(mapping),
        userId: ctx.userId ?? null,
      },
      { transaction },
    );
    // One recipient per phone: open leads of the pipeline (optionally some
    // stages) with a valid number.
    await exec(
      `INSERT INTO whatsapp_campaign_recipients (campaign_id, practice_id, lead_id, phone, name)
       SELECT DISTINCT ON (substr(l.phone_normalized, 2)) :campaignId, :practiceId, l.id, substr(l.phone_normalized, 2), l.full_name
         FROM leads l
        WHERE l.practice_id = :practiceId AND l.deleted_at IS NULL AND l.phone_normalized IS NOT NULL
          AND l.pipeline_id = :pipelineId
          AND (:allStages OR l.stage_id IN (:stageIds))
          AND (:status::text = 'all' OR l.status::text = :status)
        ORDER BY substr(l.phone_normalized, 2), l.created_at DESC`,
      {
        campaignId: campaign.id,
        practiceId: ctx.practiceId,
        pipelineId: audience.pipeline_id,
        allStages: !(audience.stage_ids ?? []).length,
        stageIds: (audience.stage_ids ?? []).length ? audience.stage_ids : ["00000000-0000-0000-0000-000000000000"],
        status: audience.status ?? "open",
      },
      { transaction },
    );
    const { n } = await one(`SELECT count(*)::int AS n FROM whatsapp_campaign_recipients WHERE campaign_id = :id`, { id: campaign.id }, { transaction });
    await exec(`UPDATE whatsapp_campaigns SET total_recipients = :n WHERE id = :id`, { id: campaign.id, n }, { transaction });
    return { ...campaign, total_recipients: n };
  });
}

export async function startCampaign(ctx, id) {
  const campaign = await loadCampaign(ctx, id);
  if (campaign.status !== "DRAFT") throw conflict(`This campaign is already ${campaign.status.toLowerCase()}.`);
  if (campaign.template_status !== "APPROVED") throw badRequest("The campaign's template isn't approved by Meta yet.");
  if (!campaign.total_recipients) throw badRequest("This campaign has no recipients.");
  await activeAccount(ctx.practiceId);
  await exec(`UPDATE whatsapp_campaigns SET status = 'SENDING', started_at = now(), updated_at = now() WHERE id = :id`, { id });
  await enqueue(QUEUES.WHATSAPP_CAMPAIGN, { campaignId: id, practiceId: ctx.practiceId }, { singletonKey: id });
  return loadCampaign(ctx, id);
}

export async function retryCampaign(ctx, id, { recipient_ids: recipientIds } = {}) {
  const campaign = await loadCampaign(ctx, id);
  if (campaign.status === "DRAFT" || campaign.status === "SENDING") throw conflict("Only a finished campaign can be retried.");
  const reset = await select(
    `UPDATE whatsapp_campaign_recipients SET status = 'pending', error_message = NULL, error_code = NULL, wamid = NULL
      WHERE campaign_id = :id AND status = 'failed' AND (:all OR id IN (:ids)) RETURNING id`,
    { id, all: !recipientIds?.length, ids: recipientIds?.length ? recipientIds : ["00000000-0000-0000-0000-000000000000"] },
  );
  if (!reset.length) throw badRequest("No failed recipients to retry.");
  await exec(
    `UPDATE whatsapp_campaigns SET failed_count = greatest(failed_count - :n, 0), status = 'SENDING', completed_at = NULL, updated_at = now()
      WHERE id = :id`,
    { id, n: reset.length },
  );
  await enqueue(QUEUES.WHATSAPP_CAMPAIGN, { campaignId: id, practiceId: ctx.practiceId }, { singletonKey: `${id}:retry` });
  return { retrying: reset.length };
}

const resolveCampaignVariables = (mapping, recipient) =>
  Array.isArray(mapping) && mapping.length
    ? { body: mapping.map((slot) => (slot?.source === "recipient_name" ? recipient.name || "there" : slot?.value ?? "")) }
    : {};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Job: sends to every pending recipient, paced; resumable (only pending
// recipients are picked up, so a retried or restarted job continues).
export async function runCampaign({ campaignId }) {
  const campaign = await one(
    `SELECT c.*, t.name AS template_name, t.language AS template_language, t.components AS template_components
       FROM whatsapp_campaigns c JOIN whatsapp_templates t ON t.id = c.template_id WHERE c.id = :campaignId`,
    { campaignId },
  );
  if (!campaign || campaign.status !== "SENDING") return;
  const account = await loadAccount(campaign.practice_id, { required: false });
  if (!account?.is_active) {
    await exec(`UPDATE whatsapp_campaigns SET status = 'FAILED', completed_at = now(), updated_at = now() WHERE id = :id`, {
      id: campaignId,
    });
    return;
  }
  const api = client(account);
  const template = { name: campaign.template_name, language: campaign.template_language, components: campaign.template_components };
  for (;;) {
    const batch = await select(
      `SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id = :campaignId AND status = 'pending' ORDER BY id LIMIT 50`,
      { campaignId },
    );
    if (!batch.length) break;
    for (const recipient of batch) {
      const variables = resolveCampaignVariables(campaign.variable_mapping, recipient);
      try {
        const meta = await api.sendMessage(templatePayload(recipient.phone, template, variables));
        const wamid = meta?.messages?.[0]?.id ?? null;
        await exec(
          `UPDATE whatsapp_campaign_recipients SET status = 'sent', wamid = :wamid, sent_at = now() WHERE id = :id`,
          { id: recipient.id, wamid },
        );
        await exec(`UPDATE whatsapp_campaigns SET sent_count = sent_count + 1, updated_at = now() WHERE id = :id`, { id: campaignId });
        const conversation = await ensureConversationRow(campaign.practice_id, `+${recipient.phone}`, {
          leadId: recipient.lead_id,
          name: recipient.name,
        });
        await recordOutbound(campaign.practice_id, conversation.id, {
          wamid,
          type: "template",
          body: renderTemplateBodyText(template.components, variables) || `[template: ${template.name}]`,
          templateName: template.name,
          userId: campaign.created_by,
        });
      } catch (error) {
        const code = error instanceof CloudApiError ? error.code ?? null : null;
        await exec(
          `UPDATE whatsapp_campaign_recipients SET status = 'failed', error_message = :msg, error_code = :code WHERE id = :id`,
          { id: recipient.id, msg: String(error.message).slice(0, 500), code },
        );
        await exec(`UPDATE whatsapp_campaigns SET failed_count = failed_count + 1, updated_at = now() WHERE id = :id`, {
          id: campaignId,
        });
      }
      if (config.whatsapp_cloud.campaign_send_interval_ms) await sleep(config.whatsapp_cloud.campaign_send_interval_ms);
    }
  }
  await exec(`UPDATE whatsapp_campaigns SET status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE id = :id`, {
    id: campaignId,
  });
}
