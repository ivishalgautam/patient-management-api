import { z } from "zod";

export const bannerSchema = z.object({
  url: z
    .string({ required_error: "Url is required." })
    .min(1, { message: "Url is required." }),
  is_featured: z.boolean().optional(),
  type: z.enum(["banner", "video"], { message: "Type is required." }),
});
