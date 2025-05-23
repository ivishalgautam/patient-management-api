import { z } from "zod";

export const loginSchema = z.object({
  username: z
    .string({ required_error: "Username is required." })
    .min(1, { message: "Username is required." }),
  password: z
    .string({ required_error: "Password is required." })
    .min(1, { message: "Password is required." }),
  role: z.enum(["admin", "doctor", "staff", "patient"]),
});
