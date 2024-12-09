import { z } from "zod";

export const serviceSchema = z.object({
  procedure_id: z.string({ required_error: "Procedure is required." }),
  actual_price: z.number({ required_error: "Actual price is required." }),
  discounted_price: z.number().optional(),
  name: z.string({ required_error: "Service name is required." }),
  image: z.string({ required_error: "Service image is required." }),
  is_featured: z.boolean().optional(),
  main_points: z.array(z.string(), {
    required_error: "Main points are required.",
  }),
  custom_points: z
    .array(
      z.object({
        heading: z
          .string({ required_error: "Heading is required in custom points." })
          .min(1, { message: "Heading is required in custom points." }),
        body: z
          .array(z.string())
          .min(2, { message: "Body must have at least 2 items." }),
      }),
      { required_error: "Custom points are required." }
    )
    .min(1, { message: "Custom points must have at least 2 items." }),
});
