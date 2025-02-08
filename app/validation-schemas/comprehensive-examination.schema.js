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
  gallery: z
    .array(z.string())
    .min(1, { message: "Atleast 1 gallery is required." }),
  affected_tooths: z
    .array(z.string())
    .min(1, { message: "Atleast 1 affected tooth is required." }),
});

// export const comprehensiveExaminationSchema = z.object({
//   chief_complaint: z
//     .string({ required_error: "Chief complaint is required." })
//     .min(1, { message: "Chief complaint is required." }),
//   medical_history: z
//     .string({ required_error: "Medical history is required." })
//     .min(1, { message: "Medical history is required." }),
//   dental_history: z
//     .string({ required_error: "Dental history is required." })
//     .min(1, { message: "Dental history is required." }),
//   examination: z
//     .string({ required_error: "Examination is required." })
//     .min(1, { message: "Examination is required." }),
//   gallery: z
//     .array(z.string())
//     .min(1, { message: "Atleast 1 gallery is required." }),
//   affected_tooths: z
//     .array(z.string())
//     .min(1, { message: "Atleast 1 affected tooth is required." }),
// });
