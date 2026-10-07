import { z } from "zod";

const uuid = z.string().uuid();
const page = z.coerce.number().int().min(1).default(1);

export const settingsInput = z.object({
  phone_number_id: z.string().trim().regex(/^\d{5,32}$/, "The phone number ID is a long number from Meta's WhatsApp setup page."),
  waba_id: z.string().trim().regex(/^\d{5,32}$/, "The WhatsApp Business Account ID is a long number from Meta."),
  access_token: z.string().trim().min(20).max(2000).optional(),
  is_active: z.boolean().optional(),
  create_leads_from_inbound: z.boolean().optional(),
  default_pipeline_id: uuid.nullable().optional(),
  default_stage_id: uuid.nullable().optional(),
});

const button = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
  z.object({
    type: z.literal("URL"),
    text: z.string().min(1).max(25),
    url: z.string().url().max(2000),
    example: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone_number: z.string().min(5).max(20) }),
]);

const component = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HEADER"),
    format: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]),
    text: z.string().max(60).optional(),
    example: z.any().optional(),
  }),
  z.object({ type: z.literal("BODY"), text: z.string().min(1).max(1024), example: z.any().optional() }),
  z.object({ type: z.literal("FOOTER"), text: z.string().min(1).max(60) }),
  z.object({ type: z.literal("BUTTONS"), buttons: z.array(button).min(1).max(10) }),
]);

export const templateInput = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Lowercase letters, numbers and underscores only."),
  category: z.enum(["MARKETING", "UTILITY"]),
  language: z.string().trim().min(2).max(16).default("en_US"),
  parameter_format: z.enum(["positional", "named"]).default("positional"),
  components: z
    .array(component)
    .min(1)
    .refine((c) => c.some((x) => x.type === "BODY"), "A template needs a body."),
});

export const templateQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"]).optional(),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).optional(),
  deleted: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

export const conversationQuery = z.object({
  filter: z.enum(["all", "unread", "read"]).default("all"),
  q: z.string().trim().max(100).optional(),
  page,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const variables = z
  .object({
    header: z.array(z.string().max(1000)).optional(),
    body: z.array(z.string().max(1000)).optional(),
    header_image_url: z.string().url().optional(),
    header_document_url: z.string().url().optional(),
    header_document_filename: z.string().max(255).optional(),
    header_video_url: z.string().url().optional(),
  })
  .default({});

export const sendInput = z
  .object({ text: z.string().trim().min(1).max(4096).optional(), template_id: uuid.optional(), variables })
  .refine((v) => v.text || v.template_id, "Write a message or choose a template.");

export const startInput = z
  .object({ lead_id: uuid.optional(), phone: z.string().trim().max(20).optional(), template_id: uuid, variables })
  .refine((v) => v.lead_id || v.phone, "Choose a lead or enter a phone number.");

export const ensureInput = z
  .object({ lead_id: uuid.optional(), phone: z.string().trim().max(20).optional() })
  .refine((v) => v.lead_id || v.phone, "Choose a lead or enter a phone number.");

export const campaignInput = z.object({
  name: z.string().trim().min(1).max(255),
  template_id: uuid,
  audience_filter: z.object({
    pipeline_id: uuid,
    stage_ids: z.array(uuid).max(50).default([]),
    status: z.enum(["open", "won", "lost", "converted", "all"]).default("open"),
  }),
  variable_mapping: z
    .array(z.object({ source: z.enum(["static", "recipient_name"]), value: z.string().max(1000).optional() }))
    .max(20)
    .default([]),
});

export const campaignQuery = z.object({ page, limit: z.coerce.number().int().min(1).max(100).default(20) });
export const recipientQuery = z.object({
  status: z.enum(["pending", "sent", "delivered", "read", "replied", "failed"]).optional(),
});
export const retryInput = z.object({ recipient_ids: z.array(uuid).max(1000).optional() });
