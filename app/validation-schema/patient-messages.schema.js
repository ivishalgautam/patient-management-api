"use strict";
import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-08.");
const mapping = z
  .array(z.object({ source: z.enum(["static", "recipient_name"]), value: z.string().max(1000).optional() }))
  .max(20)
  .default([]);
const content = {
  whatsapp_template_id: uuid.nullable().optional(),
  variable_mapping: mapping,
  email_subject: z.string().trim().max(255).nullable().optional(),
  email_body: z.string().trim().max(5000).nullable().optional(),
};

export const ruleInput = z.object({
  is_active: z.boolean(),
  recall_months: z.coerce.number().int().min(1).max(36).optional(),
  ...content,
});
export const kindParam = z.object({ kind: z.enum(["recall", "birthday"]) });

export const audienceInput = z
  .object({
    clinic_id: uuid.optional().nullable(),
    last_visit_from: date.optional().nullable(),
    last_visit_to: date.optional().nullable(),
  })
  .default({});
export const broadcastInput = z.object({ name: z.string().trim().min(1).max(255), audience: audienceInput, ...content });
export const messageQuery = z.object({
  kind: z.enum(["recall", "birthday", "broadcast"]).optional(),
  status: z.enum(["pending", "sent", "failed", "skipped"]).optional(),
  broadcast_id: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const retryInput = z.object({ broadcast_id: uuid.optional() });
