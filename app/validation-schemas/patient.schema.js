import { z } from "zod";

export const patientSchema = z.object({
  blood_group: z
    .string({ required_error: "Blood group is required." })
    .min(1, { message: "Blood group is required." }),
  marital_status: z.enum(["single", "married", ""], {
    required_error: "Marital status is required.",
  }),
  height_in_cm: z
    .string({ required_error: "Height is required." })
    .min(1, { message: "Marital status is required." }),
  emergency_contact: z.string({
    required_error: "Emergency contact is required.",
  }),
  source: z
    .string({ required_error: "Source is required" })
    .min(1, { message: "Emergency contact is required." }),
});
