import { z } from "zod";

const uuid = z.string().uuid();
const target = z
  .string()
  .refine((t) => ["full_name", "first_name", "last_name", "phone", "email", "notes", "ignore"].includes(t) || /^cf:[a-z0-9_]+$/.test(t), {
    message: "Map to full_name, first_name, last_name, phone, email, notes, ignore or cf:<custom field key>",
  });
export const fieldMapping = z.record(z.string().min(1).max(200), target).optional();

export const integrationUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  default_pipeline_id: uuid.optional(),
  default_stage_id: uuid.optional(),
  clinic_id: uuid.nullable().optional(),
  field_mapping: fieldMapping,
  dedupe_policy: z.enum(["merge", "create_flagged", "skip"]).optional(),
  paths: z.record(z.string(), z.string()).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  // Google Ads lead forms
  google_key: z.string().min(8).max(200).optional(),
  accept_test_leads: z.boolean().optional(),
});

export const webhookIntegrationCreate = z.object({
  provider_key: z.enum(["custom_webhook", "google_ads_lead_form"]),
  name: z.string().trim().min(1).max(120),
  default_pipeline_id: uuid,
  default_stage_id: uuid,
  clinic_id: uuid.nullable().optional(),
  field_mapping: fieldMapping,
  dedupe_policy: z.enum(["merge", "create_flagged", "skip"]).optional(),
  paths: z.record(z.string(), z.string()).optional(),
  google_key: z.string().min(8).max(200).optional(),
});

export const facebookFinalize = z.object({
  session: uuid,
  page_id: z.string().min(1),
  form_ids: z.array(z.string()).max(50).optional(),
  forms: z.array(z.object({ id: z.string(), name: z.string() })).max(50).optional(),
  default_pipeline_id: uuid,
  default_stage_id: uuid,
  clinic_id: uuid.nullable().optional(),
  field_mapping: fieldMapping,
  dedupe_policy: z.enum(["merge", "create_flagged", "skip"]).optional(),
});

export const eventsQuery = z.object({
  status: z.enum(["queued", "processed", "duplicate", "ignored", "error"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
