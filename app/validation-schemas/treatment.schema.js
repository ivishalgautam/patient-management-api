import { z } from "zod";

export const treatmentSchema = z.object({
  service_id: z
    .string({ required_error: "Service is required." })
    .uuid()
    .min(1, { message: "Service is required." }),
  patient_id: z
    .string({ required_error: "Patient ID is required." })
    .uuid()
    .min(1, { message: "Patient ID is required." }),
  clinic_id: z
    .string({ required_error: "Clinic ID is required." })
    .uuid()
    .min(1, { message: "Clinic ID is required." }),
});

export const treatmentHistorySchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  content: z
    .string({ required_error: "Content is required." })
    .min(1, { message: "Content is required." }),
  files: z.array(z.string()).optional(),
});

export const treatmentDentalChartSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  affected_tooths: z
    .array(z.string(), { required_error: "Affected tooth required." })
    .min(1, { message: "Affected tooth is required." }),
});

export const dentalNoteSchema = z.object({
  patient_id: z
    .string({ required_error: "Patient ID is required." })
    .uuid()
    .min(1, { message: "Patient ID is required." }),
  notes: z
    .string({ required_error: "Notes is required." })
    .min(1, { message: "Notes is required." }),
  affected_tooths: z
    .string({})
    .min(1, { message: "Affected tooths is required." }),
});

export const xraySchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  title: z
    .string({ required_error: "Title is required." })
    .min(1, { message: "Title is required." }),
});

export const documentDoctorSchema = z.object({
  patient_id: z
    .string({ required_error: "Patient ID is required." })
    .uuid()
    .min(1, { message: "Patient ID is required." }),
  title: z
    .string({ required_error: "Title is required." })
    .min(1, { message: "Title is required." }),
  documents: z.array(z.string()),
});

export const documentPatientSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  title: z
    .string({ required_error: "Title is required." })
    .min(1, { message: "Title is required." }),
  documents: z.array(z.string()),
});

export const investigationSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  temperature: z
    .number({ required_error: "Temperature is required." })
    .min(1, { message: "Temperature is required." }),
  weight: z
    .number({ required_error: "Weight is required." })
    .min(1, { message: "Weight is required." }),
  blood_pressure: z
    .number({ required_error: "Blood pressure is required." })
    .min(1, { message: "Blood pressure is required." }),
  oxygen_saturation: z
    .number({ required_error: "Oxygen saturation is required." })
    .min(1, { message: "Oxygen saturation is required." }),
});

export const treatmentPlanSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  total_cost: z
    .number({ required_error: "Total cost is required." })
    .min(1, { message: "Total cost is required." }),
  notes: z
    .array(
      z.object({ note: z.string({ required_error: "Note is required." }) })
    )
    .min(1, { message: "Atleast 1 note is required." }),
});

export const treatmentPaymentSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  payment_type: z.enum(["full", "installment"], {
    required_error: "Payment type is required.",
  }),
  payment_method: z.enum(["upi", "cash", "other"], {
    required_error: "Payment method is required.",
  }),
  amount_paid: z
    .number({ required_error: "Amount paid is required." })
    .min(1, { message: "Amount paid is required." }),
  remarks: z.string().optional(),
});

export const treatmentPrescriptionSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  data: z
    .array(
      z.object({
        medicine_name: z
          .string({ required_error: "Medicine name is required." })
          .min(1, "Medicine name is required. Example: 'Amoxicillin'"),
        dosage: z
          .string({ required_error: "Dosage is required." })
          .min(1, "Dosage is required. Example: '500mg'"),
        tablet_amount: z
          .number()
          .int()
          .positive("Tablet amount must be a positive integer. Example: 2"),
        frequency: z.enum(["morning", "afternoon", "evening"], {
          required_error: "Frequency is required. Example: 'morning'",
          invalid_type_error:
            "Frequency must be one of: 'morning', 'afternoon', 'evening'.",
        }),
        duration: z
          .number()
          .positive("Duration must be a positive number. Example: 7"),
        notes: z.string().optional().describe("Example: 'Take with food.'"),
      }),
      "Data is required."
    )
    .min(1, { message: "Data is required." }),
});
