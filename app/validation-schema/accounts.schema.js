"use strict";
import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-08.");
const amount = z.coerce.number().int("Amounts are whole rupees.").positive().max(100_000_000);
const text = (max) => z.string().trim().max(max).optional().nullable();

export const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "cheque", "other"];

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export const categoryUpdate = categoryInput.partial().extend({ archived: z.boolean().optional() });

export const expenseInput = z.object({
  clinic_id: uuid,
  category_id: uuid,
  expense_date: date,
  amount,
  payment_method: z.enum(PAYMENT_METHODS).default("cash"),
  vendor: text(255),
  reference: text(120),
  notes: text(2000),
});
export const expenseUpdate = expenseInput.partial();

const range = {
  clinic_id: uuid.optional(),
  from: date.optional(),
  to: date.optional(),
};
export const expenseQuery = z.object({
  ...range,
  category_id: uuid.optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const cashEntryInput = z
  .object({
    clinic_id: uuid,
    entry_date: date,
    type: z.enum(["opening_balance", "cash_in", "cash_out", "bank_deposit"]),
    amount,
    bank_name: text(120),
    reference: text(120),
    notes: text(2000),
  })
  .refine((v) => v.type !== "bank_deposit" || v.bank_name, { path: ["bank_name"], message: "Enter the bank the cash was deposited in." });

export const cashBookQuery = z.object({ clinic_id: uuid, from: date.optional(), to: date.optional() });
export const summaryQuery = z.object(range);

const item = z.object({
  description: z.string().trim().min(1).max(255),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  unit_price: z.coerce.number().int().min(0).max(100_000_000),
});
export const invoiceInput = z.object({
  clinic_id: uuid,
  patient_id: uuid,
  treatment_id: uuid.optional().nullable(),
  issue_date: date.optional(),
  due_date: date.optional().nullable(),
  items: z.array(item).min(1, "Add at least one line.").max(50),
  discount: z.coerce.number().int().min(0).default(0),
  tax_percent: z.coerce.number().min(0).max(28).default(0),
  notes: text(2000),
});
export const invoiceQuery = z.object({
  ...range,
  patient_id: uuid.optional(),
  status: z.enum(["issued", "cancelled"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const cancelInput = z.object({ reason: z.string().trim().min(1).max(255) });
