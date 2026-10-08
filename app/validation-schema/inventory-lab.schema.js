"use strict";
import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-08.");
const text = (max) => z.string().trim().max(max).optional().nullable();
const money = z.coerce.number().int("Amounts are whole rupees.").min(0).max(100_000_000);
const methods = z.enum(["cash", "upi", "card", "bank_transfer", "cheque", "other"]);

// --- inventory -----------------------------------------------------------------------
const contact = {
  contact_person: text(255),
  phone: text(32),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("").transform(() => null)),
  notes: text(2000),
};
export const supplierInput = z.object({ name: z.string().trim().min(1).max(255), ...contact });
export const supplierUpdate = supplierInput.partial().extend({ archived: z.boolean().optional() });

export const itemQuery = z.object({
  clinic_id: uuid,
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  low_stock: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  include_archived: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});
const itemFields = {
  name: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(60).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  sku: text(80),
  reorder_level: z.coerce.number().int().min(0).max(1_000_000).optional(),
  unit_cost: money.optional().nullable(),
  supplier_id: uuid.optional().nullable(),
  notes: text(2000),
};
export const itemInput = z.object({ clinic_id: uuid, ...itemFields, opening_stock: z.coerce.number().int().min(0).max(1_000_000).optional() });
export const itemUpdate = z.object(itemFields).partial().extend({ archived: z.boolean().optional() });

export const movementInput = z
  .object({
    type: z.enum(["purchase", "used", "wasted", "adjustment"]),
    quantity: z.coerce.number().int().refine((n) => n !== 0, "Enter a quantity.").refine((n) => Math.abs(n) <= 1_000_000, "That's too many."),
    unit_cost: money.optional().nullable(),
    supplier_id: uuid.optional().nullable(),
    expiry_date: date.optional().nullable(),
    movement_date: date.optional(),
    reference: text(120),
    notes: text(2000),
    create_expense: z.boolean().optional(),
    payment_method: methods.optional(),
  })
  .refine((v) => v.type === "adjustment" || v.quantity > 0, { path: ["quantity"], message: "Enter how many." });
export const reportQuery = z.object({ clinic_id: uuid, from: date, to: date });

// --- lab ---------------------------------------------------------------------------
export const labInput = z.object({ name: z.string().trim().min(1).max(255), ...contact, address: text(1000) });
export const labUpdate = labInput.partial().extend({ archived: z.boolean().optional() });

const orderFields = {
  work_type: z.string().trim().min(1).max(80),
  teeth: text(120),
  shade: text(40),
  material: text(120),
  instructions: text(4000),
  due_date: date.optional().nullable(),
  lab_cost: money.optional().nullable(),
};
export const orderInput = z.object({
  clinic_id: uuid,
  lab_id: uuid,
  patient_id: uuid,
  treatment_id: uuid.optional().nullable(),
  ...orderFields,
  send_now: z.boolean().optional(),
  sent_date: date.optional(),
});
export const orderUpdate = z.object(orderFields).partial();
export const orderQuery = z.object({
  clinic_id: uuid.optional(),
  lab_id: uuid.optional(),
  patient_id: uuid.optional(),
  status: z.enum(["open", "overdue", "unpaid", "draft", "sent", "received", "fitted", "remake", "cancelled"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const statusInput = z.object({
  status: z.enum(["sent", "received", "fitted", "remake", "cancelled"]),
  note: text(2000),
  date: date.optional(),
  due_date: date.optional(),
});
export const paidInput = z.object({ create_expense: z.boolean().optional(), payment_method: methods.optional(), date: date.optional() });
