import { z } from "zod";

export const userSchema = z.object({
  fullname: z
    .string({ required_error: "Full name is required." })
    .min(1, { message: "Full name is required." }),
  country_code: z
    .string({ required_error: "Country code is required." })
    .min(1, { message: "Country code is required." }),
  mobile_number: z
    .string({ required_error: "Mobile number is required." })
    .min(1, { message: "Mobile number is required." }),
  email: z
    .string({ required_error: "Email is required." })
    .email("Invalid email format."),
  gender: z.enum(["male", "female", "other"], "Gender is required."),
  dob: z
    .string({ required_error: "Date of birth is required." })
    .date({ message: "Invalid date of birth string!" })
    .min(1, { message: "Date of birth is required." }), // Use a string format and parse as needed
  username: z
    .string({ required_error: "Username is required.." })
    .min(3, "Username must be at least 3 characters.")
    .max(16, "Username must be no more than 16 characters.")
    .regex(/^[0-9A-Za-z]+$/, "Username must be alphanumeric."),
  password: z
    .string({ required_error: "Password is required." })
    .min(1, { message: "Password is required." }),
  role: z.enum(["patient", "doctor", "admin", "staff"], {
    message: "Role is required.",
  }),
  avatar: z.string().optional(),
});
