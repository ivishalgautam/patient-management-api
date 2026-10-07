import { z } from "zod";

export const blockSlotSchema = z
  .object({
    type: z.enum(["date", "slot"], { required_error: "Type is required." }),
    date: z
      .string({ required_error: "Date is required." })
      .date()
      .min(1, { message: "Date is required." }),
    slots: z.array(z.string()),
    clinic_id: z.string({ required_error: "Clinic ID is required." }).uuid(),
  })
  .refine(
    (data) => data.type !== "slot" || (data.slots && data.slots.length > 0),
    {
      message: "Slots must not be empty when type is 'slot'.",
      path: ["slots"],
    }
  );
