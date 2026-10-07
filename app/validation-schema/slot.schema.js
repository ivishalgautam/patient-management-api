import { z } from "zod";
import constants from "../lib/constants/index.js";

const slotInterval = constants.static.slotInterval;

export const createSlotSchema = z.object({
  start_time: z
    .string({ required_error: "Start time is required." })
    .min(1, { message: "Start time is required." }),
  end_time: z
    .string({ required_error: "End time is required." })
    .min(1, { message: "End time is required." }),
  interval_in_minute: z
    .number({ required_error: "Interval is required." })
    .int()
    .min(slotInterval, {
      message: `Minimum ${slotInterval} minutes interval allowed.`,
    }),
  days_off: z
    .array(z.number(), { required_error: "Days off is required." })
    .nonempty({ message: "Days off can't be empty." }),
  clinic_id: z.string({ required_error: "Clinic ID is required." }).uuid(),
});

export const updateSlotSchema = z.object({
  start_time: z
    .string({ required_error: "Start time is required." })
    .min(1, { message: "Start time is required." }),
  end_time: z
    .string({ required_error: "End time is required." })
    .min(1, { message: "End time is required." }),
  interval_in_minute: z
    .number({ required_error: "Interval is required." })
    .int()
    .min(slotInterval, {
      message: `Minimum ${slotInterval} minutes interval allowed.`,
    }),
  days_off: z
    .array(z.number(), { required_error: "Days off is required." })
    .nonempty({ message: "Days off can't be empty." }),
});
