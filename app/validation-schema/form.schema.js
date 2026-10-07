import { z } from "zod";

export const CORE_FORM_KEYS = ["full_name", "phone", "email", "notes"];

const field = z
  .object({
    source: z.enum(["core", "custom"]),
    core_key: z.enum(CORE_FORM_KEYS).optional(),
    custom_field_id: z.string().uuid().optional(),
    label_override: z.string().trim().max(120).optional().nullable(),
    placeholder: z.string().trim().max(160).optional().nullable(),
    is_required: z.boolean().optional().default(false),
    validation: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        pattern: z.string().max(200).optional(),
      })
      .optional()
      .default({}),
    section: z.string().trim().max(80).optional().nullable(),
    width: z.enum(["full", "half"]).optional().default("full"),
  })
  .refine((f) => (f.source === "core" ? !!f.core_key : !!f.custom_field_id), {
    message: "core fields need core_key, custom fields need custom_field_id",
  });

const settings = z
  .object({
    title: z.string().trim().max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    submit_label: z.string().trim().max(40).optional(),
    thank_you_message: z.string().trim().max(1000).optional(),
    redirect_url: z.string().url().optional().nullable(),
    theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    source: z.string().trim().max(60).optional(),
    dedupe: z.enum(["merge", "create_flagged", "skip"]).optional(),
    spam: z
      .object({
        honeypot: z.boolean().optional(),
        min_seconds: z.number().int().min(0).max(120).optional(),
        turnstile: z.boolean().optional(),
      })
      .optional(),
  })
  .optional()
  .default({});

const base = {
  name: z.string().trim().min(1).max(120),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  clinic_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  assignment: z.enum(["round_robin", "fixed", "none"]).optional().default("round_robin"),
  fixed_owner_id: z.string().uuid().optional().nullable(),
  settings,
  fields: z.array(field).min(1).max(40),
};

const fieldRules = (f) => {
  const keys = f.fields.filter((x) => x.source === "core").map((x) => x.core_key);
  return keys.includes("full_name") && (keys.includes("phone") || keys.includes("email"));
};

export const formCreate = z
  .object(base)
  .refine(fieldRules, { path: ["fields"], message: "A form needs a name field and a phone or email field" })
  .refine((f) => f.assignment !== "fixed" || f.fixed_owner_id, {
    path: ["fixed_owner_id"],
    message: "Choose who receives the leads",
  });

export const formUpdate = formCreate;

export const submissionInput = z.object({
  values: z.record(z.string(), z.any()).default({}),
  _hp: z.string().optional(),
  _token: z.string().optional(),
  turnstile_token: z.string().optional(),
});

export const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/) });
