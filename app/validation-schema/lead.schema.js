import { z } from "zod";

const uuid = z.string().uuid();
const optionalText = (max) => z.string().trim().max(max).optional().nullable();
const customFields = z.record(z.string(), z.any()).optional();

export const leadCreate = z
  .object({
    full_name: z.string().trim().min(1, "Name is required").max(160),
    phone: optionalText(32),
    email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")),
    pipeline_id: uuid.optional(),
    stage_id: uuid.optional(),
    owner_id: uuid.optional().nullable(),
    clinic_id: uuid.optional().nullable(),
    source: z.string().trim().min(1).max(60).optional(),
    sub_source: optionalText(120),
    notes: optionalText(5000),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    custom_fields: customFields,
    next_follow_up_at: z.coerce.date().optional().nullable(),
    // Create even when a lead with the same phone/email exists.
    force: z.boolean().optional().default(false),
  })
  .refine((l) => l.phone || l.email, { path: ["phone"], message: "Phone or email is required" });

export const leadUpdate = z.object({
  full_name: z.string().trim().min(1).max(160).optional(),
  phone: optionalText(32),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")),
  clinic_id: uuid.optional().nullable(),
  source: z.string().trim().min(1).max(60).optional(),
  sub_source: optionalText(120),
  notes: optionalText(5000),
  lost_reason: optionalText(255),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  custom_fields: customFields,
});

export const moveInput = z.object({
  stage_id: uuid,
  lost_reason: optionalText(255),
});

export const assignInput = z.object({ owner_id: uuid.nullable() });

export const bulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), lead_ids: z.array(uuid).min(1).max(500), owner_id: uuid.nullable() }),
  z.object({ action: z.literal("move"), lead_ids: z.array(uuid).min(1).max(500), stage_id: uuid }),
  z.object({ action: z.literal("tag"), lead_ids: z.array(uuid).min(1).max(500), tags: z.array(z.string().min(1)).min(1) }),
  z.object({ action: z.literal("untag"), lead_ids: z.array(uuid).min(1).max(500), tag_ids: z.array(uuid).min(1) }),
  z.object({ action: z.literal("delete"), lead_ids: z.array(uuid).min(1).max(500) }),
]);

export const activityCreate = z.object({
  type: z.enum(["note", "call", "whatsapp", "email", "meeting", "follow_up"]),
  body: z.string().trim().max(5000).optional().nullable(),
  due_at: z.coerce.date().optional().nullable(),
}).refine((a) => a.type !== "follow_up" || a.due_at, { path: ["due_at"], message: "A follow-up needs a due date" });

export const activityUpdate = z.object({
  body: z.string().trim().max(5000).optional().nullable(),
  due_at: z.coerce.date().optional().nullable(),
  completed: z.boolean().optional(),
});

export const listQuery = z.object({
  view: z.enum(["list", "kanban"]).optional().default("list"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  per_stage: z.coerce.number().int().min(1).max(100).optional().default(20),
  pipeline_id: uuid.optional(),
  stage_id: uuid.optional(),
  owner_id: z.union([uuid, z.literal("unassigned"), z.literal("me")]).optional(),
  status: z.enum(["open", "won", "lost", "converted"]).optional(),
  source: z.string().max(60).optional(),
  tag_id: uuid.optional(),
  clinic_id: uuid.optional(),
  q: z.string().trim().max(100).optional(),
  created_from: z.coerce.date().optional(),
  created_to: z.coerce.date().optional(),
  follow_up: z.enum(["overdue", "today", "upcoming", "none"]).optional(),
  sort: z.enum(["created_at", "updated_at", "next_follow_up_at", "full_name"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const duplicateQuery = z.object({
  phone: z.string().max(32).optional(),
  email: z.string().max(160).optional(),
});

export const convertInput = z.object({
  link_patient_id: uuid.optional(),
  clinic_id: uuid.optional(),
  patient: z
    .object({
      fullname: z.string().trim().min(1).max(160).optional(),
      mobile_number: z.string().regex(/^\d{6,15}$/, "Digits only").optional(),
      country_code: z.string().regex(/^\d{1,4}$/).optional(),
      email: z.string().email().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
    })
    .optional(),
  booking: z.object({ date: z.string().date(), slot: z.string().regex(/^\d{2}:\d{2}:\d{2}$/) }).optional(),
  move_to_won: z.boolean().optional(),
});
