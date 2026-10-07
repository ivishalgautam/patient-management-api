import { z } from "zod";

export const userSchema = z
  .object({
    fullname: z
      .string({ required_error: "Full name is required." })
      .min(1, { message: "Full name is required." }),
    country_code: z
      .string({ required_error: "Country code is required." })
      .min(1, { message: "Country code is required." }),
    mobile_number: z
      .string({ required_error: "Mobile number is required." })
      .min(1, { message: "Mobile number is required." }),
    username: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    gender: z.string().optional(),
    dob: z.string().optional(),
    role: z.enum(["patient", "doctor", "admin", "staff"], {
      message: "Role is required.",
    }),
    avatar: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "patient") {
      if (
        !data.username ||
        data.username.length < 3 ||
        data.username.length > 16 ||
        !/^[0-9A-Za-z]+$/.test(data.username)
      ) {
        ctx.addIssue({
          path: ["username"],
          message: "Username must be 3–16 characters and alphanumeric.",
          code: z.ZodIssueCode.custom,
        });
      }

      if (!data.password || data.password.length < 1) {
        ctx.addIssue({
          path: ["password"],
          message: "Password is required.",
          code: z.ZodIssueCode.custom,
        });
      }
    }
  });
