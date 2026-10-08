"use strict";
// Accounts & cash (Dentee-style practice accounts): expense categories and
// expenses, a cash book per clinic (opening balance, cash in/out, bank
// deposits) and numbered patient invoices. Patient receipts stay in
// treatment_payments; reports combine both. Amounts are whole rupees, like
// the rest of billing.
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

const TABLES = ["invoices", "invoice_counters", "cash_entries", "expenses", "expense_categories"];
const TYPES = ["enum_account_payment_method", "enum_cash_entry_type", "enum_invoices_status"];
const DEFAULT_CATEGORIES = [
  ["Dental materials", "#0ea5e9"],
  ["Lab charges", "#8b5cf6"],
  ["Salaries", "#f59e0b"],
  ["Rent", "#64748b"],
  ["Electricity & utilities", "#14b8a6"],
  ["Equipment & maintenance", "#ef4444"],
  ["Marketing", "#ec4899"],
  ["Miscellaneous", "#78716c"],
];

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const practice = `practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE`;
    const clinic = `clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE`;
    const createdBy = `created_by uuid REFERENCES public.users(id) ON DELETE SET NULL`;
    await q(`
      CREATE TYPE public.enum_account_payment_method AS ENUM ('cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other');
      CREATE TYPE public.enum_cash_entry_type AS ENUM ('opening_balance', 'cash_in', 'cash_out', 'bank_deposit');
      CREATE TYPE public.enum_invoices_status AS ENUM ('issued', 'cancelled');

      CREATE TABLE public.expense_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(120) NOT NULL,
        color varchar(9) NOT NULL DEFAULT '#64748b',
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX expense_categories_name ON public.expense_categories (practice_id, lower(name));

      CREATE TABLE public.expenses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        ${clinic},
        category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
        expense_date date NOT NULL,
        amount int NOT NULL CHECK (amount > 0),
        payment_method public.enum_account_payment_method NOT NULL DEFAULT 'cash',
        vendor varchar(255),
        reference varchar(120),
        notes text,
        ${createdBy},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
      CREATE INDEX expenses_practice_date ON public.expenses (practice_id, expense_date DESC) WHERE deleted_at IS NULL;
      CREATE INDEX expenses_clinic_date ON public.expenses (clinic_id, expense_date) WHERE deleted_at IS NULL;

      -- Manual cash movements. Cash in hand = opening + cash_in - cash_out -
      -- bank_deposit + cash received from patients - expenses paid in cash.
      CREATE TABLE public.cash_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        ${clinic},
        entry_date date NOT NULL,
        type public.enum_cash_entry_type NOT NULL,
        amount int NOT NULL CHECK (amount > 0),
        bank_name varchar(120),
        reference varchar(120),
        notes text,
        ${createdBy},
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
      CREATE INDEX cash_entries_clinic_date ON public.cash_entries (clinic_id, entry_date) WHERE deleted_at IS NULL;

      CREATE TABLE public.invoice_counters (
        practice_id uuid PRIMARY KEY REFERENCES public.practices(id) ON DELETE CASCADE,
        last_number int NOT NULL DEFAULT 0
      );

      CREATE TABLE public.invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        ${clinic},
        patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
        treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
        number varchar(40) NOT NULL,
        issue_date date NOT NULL,
        due_date date,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        subtotal int NOT NULL,
        discount int NOT NULL DEFAULT 0,
        tax_percent numeric(5,2) NOT NULL DEFAULT 0,
        tax_amount int NOT NULL DEFAULT 0,
        total int NOT NULL,
        notes text,
        status public.enum_invoices_status NOT NULL DEFAULT 'issued',
        cancelled_reason varchar(255),
        ${createdBy},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (practice_id, number)
      );
      CREATE INDEX invoices_practice_date ON public.invoices (practice_id, issue_date DESC);
      CREATE INDEX invoices_patient ON public.invoices (patient_id);
      CREATE INDEX invoices_treatment ON public.invoices (treatment_id);
    `);
    const values = DEFAULT_CATEGORIES.map(([name, color]) => `('${name}', '${color}')`).join(", ");
    await q(`
      INSERT INTO public.expense_categories (practice_id, name, color)
      SELECT p.id, v.name, v.color FROM public.practices p CROSS JOIN (VALUES ${values}) AS v(name, color)
    `);
    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM public.role_permissions WHERE permission_key IN ('accounts.view', 'accounts.manage')`);
    for (const t of TABLES) await q(`DROP TABLE IF EXISTS public."${t}"`);
    for (const t of TYPES) await q(`DROP TYPE IF EXISTS public."${t}"`);
  });
}
