"use strict";
import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-08.");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be like #0ea5e9");

export const chairQuery = z.object({ clinic_id: uuid, include_archived: z.enum(["true", "false"]).optional().transform((v) => v === "true") });
export const chairInput = z.object({ clinic_id: uuid, name: z.string().trim().min(1).max(60), color: color.optional() });
export const chairUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: color.optional(),
  position: z.number().int().min(0).max(1000).optional(),
  archived: z.boolean().optional(),
});
export const dayQuery = z.object({ clinic_id: uuid, date: date.optional() });
export const assignInput = z.object({ chair_id: uuid.nullable() });
export const seatInput = z.object({ chair_id: uuid.optional() });
export const waitingQuery = z
  .object({ clinic_id: uuid, from: date, to: date })
  .refine((v) => v.from <= v.to, { path: ["to"], message: "The end date is before the start date." });
