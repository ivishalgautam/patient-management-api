import { z } from "zod";

export const patientSchema = z.object({
  blood_group: z.string().optional(),
  marital_status: z.enum(["single", "married", ""]).optional(),
  height_in_cm: z.string().optional(),
  emergency_contact: z.string().optional(),
  source: z.string().optional(),
});
