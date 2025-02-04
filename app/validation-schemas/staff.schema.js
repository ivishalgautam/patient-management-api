import { z } from "zod";

export const staffSchema = z.object({
  doctor_id: z
    .string({ required_error: "Doctor ID is required." })
    .uuid()
    .min(1, { message: "Doctor ID is required." }),
  staff_id: z
    .string({ required_error: "Staff ID is required." })
    .uuid()
    .min(1, { message: "Staff ID is required." }),
});
