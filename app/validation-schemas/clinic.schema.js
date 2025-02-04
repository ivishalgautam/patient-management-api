import { z } from "zod";

export const clinicSchema = z.object({
  name: z
    .string({ required_error: "Clinic name is required." })
    .min(1, { message: "Clinic name is required." }),
  address: z
    .string({ required_error: "Clinic address is required." })
    .min(1, { message: "Clinic address is required." }),
});
