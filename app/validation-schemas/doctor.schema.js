import { z } from "zod";

export const doctorSchema = z.object({
  specialization: z
    .string()
    .min(1, { message: "Specialization is required for doctors." }),
  experience_years: z
    .number()
    .positive("Experience years must be a positive number."),
  about: z.string().optional(),
  certifications: z.array(z.string()).optional(),
});
