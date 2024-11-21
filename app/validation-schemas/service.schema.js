import { z } from "zod";

export const serviceSchema = z.object({
  procedure_id: z.string({ required_error: "Procedure is required." }),
  actual_price: z.number({ required_error: "Actual price is required." }),
  discounted_price: z.number().optional(),
  name: z.string({ required_error: "Service name is required." }),
  image: z.string({ required_error: "Service image is required." }),
  is_featured: z.boolean().optional(),
  main_points: z.array(z.string, {
    required_error: "Main points are required.",
  }),
  custom_points: z.array(z.string, {
    required_error: "Custom points are required.",
  }),
});
