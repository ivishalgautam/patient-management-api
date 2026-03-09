import { z } from "zod";

export const ledgerSchema = z.object({
  clinic_id: z.string().uuid("Invalid clinic id"),

  patient_id: z.string().uuid("Invalid patient id"),

  service_id: z.string().uuid("Invalid service id").optional().nullable(),

  reference_type: z.enum([
    "treatment_payment",
    "treatment_plan",
    "expense",
    "refund",
    "adjustment",
  ]),

  entry_type: z.enum(["debit", "credit"]),

  amount: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .int("Amount must be an integer")
    .positive("Amount must be greater than 0"),

  description: z
    .string()
    .max(255, "Description too long")
    .optional()
    .nullable(),
});
