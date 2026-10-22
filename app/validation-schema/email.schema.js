"use strict";
import { z } from "zod";

const uuid = z.string().uuid();
const email = z.string().trim().email("Enter a valid email address.").max(255);
const host = z
  .string()
  .trim()
  .max(255)
  .regex(/^[a-z0-9.-]*$/i, "The server name looks like smtp.example.com.");
const port = z.coerce.number().int().min(1).max(65535);
const optionalText = (max) => z.string().trim().max(max).optional().nullable();

// --- accounts & settings ---------------------------------------------------------
const accountFields = {
  provider: z.string().max(30).optional(),
  email_address: email,
  display_name: optionalText(120),
  smtp_host: host.min(3),
  smtp_port: port,
  smtp_secure: z.boolean().default(false),
  imap_host: host.optional().nullable(),
  imap_port: port.optional().nullable(),
  imap_secure: z.boolean().default(true),
  auth_user: optionalText(255),
  sync_inbound: z.boolean().optional(),
};
export const accountInput = z.object({ ...accountFields, password: z.string().min(1, "Enter the password.").max(500) });
export const accountUpdate = z
  .object({ ...accountFields, password: z.string().max(500).optional(), paused: z.boolean().optional() })
  .partial();
export const settingsInput = z.object({
  is_enabled: z.boolean(),
  default_from_name: optionalText(120),
  default_account_id: uuid.optional().nullable(),
  signature: optionalText(2000),
});
export const syncInput = z.object({ account_id: uuid.optional() });

// --- templates -----------------------------------------------------------------------
const block = z
  .object({
    id: z.string().max(60),
    type: z.enum(["title", "paragraph", "image", "button", "divider", "spacer", "social"]),
    text: z.string().max(10_000).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    src: z.string().max(2000).optional(),
    alt: z.string().max(255).optional(),
    link: z.string().max(2000).optional(),
    width: z.coerce.number().min(0).max(600).optional(),
    url: z.string().max(2000).optional(),
    color: z.string().max(9).optional(),
    height: z.coerce.number().min(0).max(200).optional(),
    links: z.array(z.object({ platform: z.string().max(40), url: z.string().max(2000) })).max(10).optional(),
  })
  .passthrough();
const templateFields = {
  name: z.string().trim().min(1).max(255),
  subject: z.string().trim().min(1).max(255),
  category: z.string().max(40).optional(),
  builder_type: z.enum(["blocks", "html"]).default("blocks"),
  content_blocks: z.array(block).max(60).optional(),
  body_html: z.string().max(200_000).optional(),
  body_text: z.string().max(100_000).optional(),
  is_active: z.boolean().optional(),
};
export const templateInput = z.object(templateFields);
export const templateUpdate = z.object(templateFields).partial();
export const templateQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(40).optional(),
  active: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
});
export const previewQuery = z.object({ lead_id: uuid.optional(), patient_id: uuid.optional() });
export const draftPreviewInput = z.object({
  subject: z.string().max(255).optional(),
  builder_type: z.enum(["blocks", "html"]).default("blocks"),
  content_blocks: z.array(block).max(60).optional(),
  body_html: z.string().max(200_000).optional(),
});

// --- messages ------------------------------------------------------------------------
const addressList = z.array(email).max(50);
export const messageQuery = z.object({
  folder: z.enum(["inbox", "sent", "trash", "failed"]).optional(),
  account_id: uuid.optional(),
  lead_id: uuid.optional(),
  patient_id: uuid.optional(),
  unread: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const sendInput = z.object({
  account_id: uuid.optional(),
  to: addressList.min(1, "Add at least one recipient."),
  cc: addressList.default([]),
  bcc: addressList.default([]),
  subject: z.string().trim().max(255).optional(),
  body_text: z.string().max(100_000).optional(),
  template_id: uuid.optional(),
  lead_id: uuid.optional(),
  patient_id: uuid.optional(),
});
export const replyInput = z.object({ body_text: z.string().trim().min(1, "Write a reply.").max(100_000), reply_all: z.boolean().optional() });
export const moveInput = z.object({ folder: z.enum(["inbox", "sent", "trash", "restore"]) });
export const readInput = z.object({ is_read: z.boolean() });

// --- campaigns -----------------------------------------------------------------------
const audience = z
  .object({
    pipeline_id: uuid.optional(),
    stage_ids: z.array(uuid).max(50).optional(),
    status: z.enum(["open", "won", "lost", "converted", "all"]).optional(),
    clinic_id: uuid.optional().nullable(),
    last_visit_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    last_visit_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  })
  .default({});
const campaignFields = {
  name: z.string().trim().min(1).max(255),
  template_id: uuid,
  account_id: uuid.optional().nullable(),
  audience_type: z.enum(["leads", "patients", "upload"]),
  audience,
};
export const campaignInput = z.object(campaignFields);
export const campaignUpdate = z.object(campaignFields).partial();
export const audienceInput = z.object({ audience_type: z.enum(["leads", "patients"]), audience });
export const uploadInput = z.object({
  recipients: z.array(z.object({ email: z.string().max(255), name: z.string().max(255).optional().nullable() })).min(1).max(5000),
  replace: z.boolean().optional(),
});
export const scheduleInput = z.object({ scheduled_at: z.coerce.date() });
export const recipientQuery = z.object({ status: z.enum(["pending", "sent", "failed", "skipped"]).optional() });

// --- automation ----------------------------------------------------------------------
const ruleFields = {
  name: z.string().trim().min(1).max(255),
  trigger_type: z.enum(["lead_created", "stage_reached"]),
  pipeline_id: uuid.optional().nullable(),
  stage_id: uuid.optional().nullable(),
  template_id: uuid,
  account_id: uuid.optional().nullable(),
  is_active: z.boolean().optional(),
};
export const ruleInput = z.object(ruleFields);
export const ruleUpdate = z.object(ruleFields).partial();
export const runQuery = z.object({
  rule_id: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
