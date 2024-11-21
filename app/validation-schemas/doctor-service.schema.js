import { z } from "zod";

export const doctorServiceSchema = z.object(
  {
    doctor_id: z.string().uuid().optional(),
    services: z.array(z.string().uuid()).nonempty({
      message: "Services Can't be empty!",
    }),
  },
  { required_error: "Body should be object." }
);
