import { z } from "zod";

export const clinicStaffSchema = z.object({
  clinic_id: z
    .string({ required_error: "Clinic ID is required." })
    .uuid()
    .min(1, { message: "Clinic ID is required." }),
  staff_id: z
    .string({ required_error: "Staff ID is required." })
    .uuid()
    .min(1, { message: "Staff ID is required." }),
});
