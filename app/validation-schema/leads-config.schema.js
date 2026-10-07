import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be like #3b82f6");
export const CORE_REQUIRED_KEYS = ["full_name", "phone", "email", "notes", "next_follow_up_at", "owner_id", "clinic_id"];
const requiredField = z
  .string()
  .refine((k) => CORE_REQUIRED_KEYS.includes(k) || /^cf:[a-z0-9_]+$/.test(k), "Unknown field");

export const stageInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: hex.optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  stage_type: z.enum(["open", "won", "lost"]).optional(),
  required_fields: z.array(requiredField).max(20).optional(),
});

export const pipelineCreate = z.object({
  name: z.string().trim().min(1).max(120),
  clinic_id: z.string().uuid().nullable().optional(),
  stages: z.array(stageInput).min(1).max(30).optional(),
});

export const pipelineUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  clinic_id: z.string().uuid().nullable().optional(),
});

export const reorderInput = z.object({ stage_ids: z.array(z.string().uuid()).min(1) });
export const membersInput = z.object({ user_ids: z.array(z.string().uuid()).max(200) });

export const FIELD_TYPES = ["text", "textarea", "number", "date", "dropdown", "multi_select", "checkbox", "phone", "email", "url"];
const option = z.string().trim().min(1).max(120);

export const customFieldCreate = z
  .object({
    label: z.string().trim().min(1).max(120),
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Lowercase letters, digits and _").optional(),
    field_type: z.enum(FIELD_TYPES),
    options: z.array(option).max(100).optional().default([]),
    is_filterable: z.boolean().optional().default(false),
    position: z.coerce.number().int().min(0).optional(),
  })
  .refine(
    (f) => !["dropdown", "multi_select"].includes(f.field_type) || f.options.length > 0,
    { path: ["options"], message: "Options are required for dropdown and multi-select fields" },
  );

export const customFieldUpdate = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  options: z.array(option).max(100).optional(),
  is_filterable: z.boolean().optional(),
  position: z.coerce.number().int().min(0).optional(),
});

export const tagCreate = z.object({ name: z.string().trim().min(1).max(60), color: hex.optional() });

export const uuidParam = z.object({ id: z.string().uuid() });
