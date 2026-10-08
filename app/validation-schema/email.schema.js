"use strict";
import { z } from "zod";

const email = z.string().trim().email("Enter a valid email address.").max(255);

export const settingsInput = z.object({
  host: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+$/i, "The server name looks like smtp.example.com."),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().trim().min(1).max(255),
  password: z.string().max(500).optional(),
  from_email: email.optional().nullable().or(z.literal("").transform(() => null)),
  from_name: z.string().trim().max(120).optional().nullable(),
  reply_to: email.optional().nullable().or(z.literal("").transform(() => null)),
  is_active: z.boolean().optional(),
});
export const testInput = z.object({ to: email });
