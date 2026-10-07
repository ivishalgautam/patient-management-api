import { z } from "zod";

export const clinicPatientSchema = z.object({
  clinic_id: z
    .string({ required_error: "Clinic ID is required." })
    .uuid()
    .min(1, { message: "Clinic ID is required." }),
  patient_id: z
    .string({ required_error: "Patient ID is required." })
    .uuid()
    .min(1, { message: "Patient ID is required." }),
  appointment_id: z
    .string({ required_error: "Appointment ID is required." })
    .uuid()
    .min(1, { message: "Appointment ID is required." }),
});
