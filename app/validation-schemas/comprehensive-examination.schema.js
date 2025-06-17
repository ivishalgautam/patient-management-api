import { z } from "zod";

export const comprehensiveExaminationSchema = z.object({
  chief_complaint: z
    .string({ required_error: "Chief complaint is required." })
    .min(1, { message: "Chief complaint is required." }),
  medical_history: z
    .string({ required_error: "Medical history is required." })
    .min(1, { message: "Medical history is required." }),
  dental_history: z
    .string({ required_error: "Dental history is required." })
    .min(1, { message: "Dental history is required." }),
  examination: z
    .string({ required_error: "Examination is required." })
    .min(1, { message: "Examination is required." }),
  gallery: z.array(z.string()).optional().default([]),
  affected_tooths: z
    .array(
      z.object({
        tooth: z.coerce
          .string({ required_error: "Affected tooth is required." })
          .min(1, { message: "Affected tooth is required." }),
        color: z
          .string({ required_error: "Disease type is required." })
          .min(1, { message: "Disease type is required." }),
      })
    )
    .min(1, { message: "Affected tooth is required." }),
});
