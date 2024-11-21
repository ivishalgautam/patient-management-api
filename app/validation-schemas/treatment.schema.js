import { z } from "zod";

export const treatmentSchema = z.object({
  doctor_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  patient_id: z
    .string({ required_error: "Patient ID is required." })
    .uuid()
    .min(1, { message: "Patient ID is required." }),
  procedure_id: z
    .string({ required_error: "Procedure Id is required." })
    .uuid()
    .min(1, { message: "Procedure Id is required." }),
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

export const treatmentPlanSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  affected_tooth: z
    .number({ required_error: "Affected tooth required." })
    .min(1, { message: "Affected tooth is required." }),
  total_cost: z
    .number({ required_error: "Total cost is required." })
    .min(1, { message: "Total cost is required." }),
  notes: z
    .string({ required_error: "Notes is required." })
    .min(1, { message: "Notes is required." }),
});

export const treatmentPrescriptionSchema = z.object({
  treatment_id: z
    .string({ required_error: "Treatment ID is required." })
    .uuid()
    .min(1, { message: "Treatment ID is required." }),
  data: z
    .array(
      z.object({
        drugName: z
          .string({ required_error: "Drug name is required." })
          .min(1, { message: "Drug name is required." }),
        brandName: z
          .string({ required_error: "Brand name is required." })
          .min(1, { message: "Brand name is required." }),
        dosageForm: z
          .string({ required_error: "Dosage form is required." })
          .min(1, { message: "Dosage form is required." }),
        quantiy: z
          .string({ required_error: "Quantiy is required." })
          .min(1, { message: "Quantiy is required." }),
        frequencyAndDosage: z
          .string({ required_error: "Frequency and dosage is required." })
          .min(1, { message: "Frequency and dosage is required." }),
        duration: z
          .string({ required_error: "Duration is required." })
          .min(1, { message: "Duration is required." }),
      }),
      "Data is required."
    )
    .min(1, { message: "Data is required." }),
});
