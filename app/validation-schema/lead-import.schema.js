import { z } from "zod";
import { fieldMapping } from "./integration.schema.js";

const uuid = z.string().uuid();

export const sheetImport = z.object({
  url: z.string().trim().min(1).max(2000),
  clinic_id: uuid.nullable().optional(),
});

export const importSettings = z.object({
  mapping: fieldMapping.unwrap(),
  pipeline_id: uuid.optional(),
  stage_id: uuid.optional(),
  clinic_id: uuid.nullable().optional(),
  dedupe_policy: z.enum(["skip", "merge", "create_flagged"]).default("skip"),
  assignment: z.enum(["round_robin", "none"]).default("round_robin"),
  lead_source: z.string().trim().max(120).optional(),
});

export const importsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const importRowsQuery = importsQuery.extend({
  status: z.enum(["pending", "created", "flagged", "merged", "skipped", "error"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
