import { z } from "zod";
import constants from "../lib/constants/index.js";

export const bookingSchema = z.object({
  clinic_id: z.string({ required_error: "Clinic ID is required." }).uuid(),
  date: z
    .string({ required_error: "Date is required." })
    .min(1, { message: "Date is required." }),
  slot: z
    .string({ required_error: "Slot is required." })
    .min(1, { message: "Slot is required." }),
});
