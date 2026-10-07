import { z } from "zod";

export const procedureSchema = z.object({
  name: z
    .string({ required_error: "Procedure name is required." })
    .min(1, { message: "Procedure name is required." }),
  is_featured: z.boolean().optional(),
  image: z
    .string({ required_error: "Procedure image is required." })
    .min(1, { message: "Procedure image is required." }),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  meta_keywords: z.string().optional(),
});
