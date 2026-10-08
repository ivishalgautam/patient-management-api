"use strict";
// Accounts & cash: expenses, the per-clinic cash book, patient invoices and
// the income & expenditure summary. Patient receipts are the existing
// treatment_payments (amount_paid is money actually received; advance_used
// was received earlier).
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { badRequest, conflict, notFound } from "../../lib/app-error.js";

export const DEFAULT_CATEGORIES = [
  ["Dental materials", "#0ea5e9"],
  ["Lab charges", "#8b5cf6"],
  ["Salaries", "#f59e0b"],
  ["Rent", "#64748b"],
  ["Electricity & utilities", "#14b8a6"],
  ["Equipment & maintenance", "#ef4444"],
  ["Marketing", "#ec4899"],
  ["Miscellaneous", "#78716c"],
];

const today = () => new Date().toISOString().slice(0, 10);
const int = (v) => Number(v ?? 0);

// Practices created after the migration get the default categories on
// first use.
async function ensureCategories(practiceId) {
  const row = await one(`SELECT 1 FROM expense_categories WHERE practice_id = :practiceId LIMIT 1`, { practiceId });
  if (row) return;
  for (const [name, color] of DEFAULT_CATEGORIES) {
    await exec(
      `INSERT INTO expense_categories (practice_id, name, color) VALUES (:practiceId, :name, :color)
       ON CONFLICT DO NOTHING`,
      { practiceId, name, color },
    );
  }
}

async function assertClinic(ctx, clinicId) {
  const row = await one(`SELECT 1 FROM clinics WHERE id = :id AND practice_id = :practiceId`, { id: clinicId, practiceId: ctx.practiceId });
  if (!row) throw notFound("Clinic not found.");
}

// --- categories ----------------------------------------------------------------

export async function listCategories(ctx, { includeArchived = false } = {}) {
  await ensureCategories(ctx.practiceId);
  return select(
    `SELECT c.*, (SELECT count(*)::int FROM expenses e WHERE e.category_id = c.id AND e.deleted_at IS NULL) AS expense_count
       FROM expense_categories c
      WHERE c.practice_id = :practiceId ${includeArchived ? "" : "AND c.archived_at IS NULL"}
      ORDER BY c.archived_at NULLS FIRST, lower(c.name)`,
    { practiceId: ctx.practiceId },
  );
}

async function assertUniqueName(ctx, name, exceptId = null) {
  const taken = await one(
    `SELECT 1 FROM expense_categories WHERE practice_id = :practiceId AND lower(name) = lower(:name)
        AND (:exceptId::uuid IS NULL OR id <> :exceptId)`,
    { practiceId: ctx.practiceId, name, exceptId },
  );
  if (taken) throw conflict(`A category called "${name}" already exists.`);
}

export async function createCategory(ctx, input) {
  await assertUniqueName(ctx, input.name);
  return one(
    `INSERT INTO expense_categories (practice_id, name, color) VALUES (:practiceId, :name, coalesce(:color, '#64748b')) RETURNING *`,
    { practiceId: ctx.practiceId, name: input.name, color: input.color ?? null },
  );
}

export async function updateCategory(ctx, id, input) {
  if (input.name) await assertUniqueName(ctx, input.name, id);
  const row = await one(
    `UPDATE expense_categories SET name = coalesce(:name, name), color = coalesce(:color, color),
            archived_at = CASE WHEN :archived::boolean IS NULL THEN archived_at WHEN :archived THEN coalesce(archived_at, now()) ELSE NULL END
      WHERE id = :id AND practice_id = :practiceId RETURNING *`,
    { id, practiceId: ctx.practiceId, name: input.name ?? null, color: input.color ?? null, archived: input.archived ?? null },
  );
  if (!row) throw notFound("Category not found.");
  return row;
}

// --- expenses ------------------------------------------------------------------

async function activeCategory(ctx, id) {
  const row = await one(`SELECT archived_at FROM expense_categories WHERE id = :id AND practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Category not found.");
  if (row.archived_at) throw badRequest("This category is archived. Restore it or pick another.");
}

const EXPENSE_COLUMNS = `e.*, c.name AS category_name, c.color AS category_color, cl.name AS clinic_name, u.fullname AS created_by_name`;
const EXPENSE_FROM = `FROM expenses e
  JOIN expense_categories c ON c.id = e.category_id
  JOIN clinics cl ON cl.id = e.clinic_id
  LEFT JOIN users u ON u.id = e.created_by`;

export async function listExpenses(ctx, query) {
  const where = [`e.practice_id = :practiceId`, `e.deleted_at IS NULL`];
  const params = { practiceId: ctx.practiceId, limit: query.limit, offset: (query.page - 1) * query.limit };
  const add = (sql, key, value) => {
    where.push(sql);
    params[key] = value;
  };
  if (query.clinic_id) add(`e.clinic_id = :clinicId`, "clinicId", query.clinic_id);
  if (query.category_id) add(`e.category_id = :categoryId`, "categoryId", query.category_id);
  if (query.payment_method) add(`e.payment_method = :method`, "method", query.payment_method);
  if (query.from) add(`e.expense_date >= :from`, "from", query.from);
  if (query.to) add(`e.expense_date <= :to`, "to", query.to);
  if (query.q) add(`(e.vendor ILIKE :q OR e.reference ILIKE :q OR e.notes ILIKE :q)`, "q", `%${query.q}%`);
  const rows = await select(
    `SELECT ${EXPENSE_COLUMNS}, count(*) OVER()::int AS total, sum(e.amount) OVER()::bigint AS total_amount
       ${EXPENSE_FROM} WHERE ${where.join(" AND ")}
      ORDER BY e.expense_date DESC, e.created_at DESC LIMIT :limit OFFSET :offset`,
    params,
  );
  return {
    expenses: rows.map(({ total, total_amount, ...e }) => e),
    meta: { page: query.page, limit: query.limit, total: rows[0]?.total ?? 0, total_amount: int(rows[0]?.total_amount) },
  };
}

async function loadExpense(ctx, id) {
  const row = await one(`SELECT ${EXPENSE_COLUMNS} ${EXPENSE_FROM} WHERE e.id = :id AND e.practice_id = :practiceId AND e.deleted_at IS NULL`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Expense not found.");
  return row;
}

export async function createExpense(ctx, input) {
  await assertClinic(ctx, input.clinic_id);
  await activeCategory(ctx, input.category_id);
  const row = await one(
    `INSERT INTO expenses (practice_id, clinic_id, category_id, expense_date, amount, payment_method, vendor, reference, notes, created_by)
     VALUES (:practiceId, :clinic_id, :category_id, :expense_date, :amount, :payment_method, :vendor, :reference, :notes, :userId)
     RETURNING id`,
    { practiceId: ctx.practiceId, userId: ctx.userId, vendor: null, reference: null, notes: null, ...input },
  );
  return loadExpense(ctx, row.id);
}

export async function updateExpense(ctx, id, input) {
  const current = await loadExpense(ctx, id);
  if (input.clinic_id) await assertClinic(ctx, input.clinic_id);
  if (input.category_id && input.category_id !== current.category_id) await activeCategory(ctx, input.category_id);
  const next = { ...current, ...input };
  await exec(
    `UPDATE expenses SET clinic_id = :clinic_id, category_id = :category_id, expense_date = :expense_date, amount = :amount,
            payment_method = :payment_method, vendor = :vendor, reference = :reference, notes = :notes, updated_at = now()
      WHERE id = :id`,
    {
      id,
      clinic_id: next.clinic_id,
      category_id: next.category_id,
      expense_date: next.expense_date,
      amount: next.amount,
      payment_method: next.payment_method,
      vendor: next.vendor ?? null,
      reference: next.reference ?? null,
      notes: next.notes ?? null,
    },
  );
  return loadExpense(ctx, id);
}

export async function deleteExpense(ctx, id) {
  await loadExpense(ctx, id);
  await exec(`UPDATE expenses SET deleted_at = now() WHERE id = :id`, { id });
}

// --- cash book -----------------------------------------------------------------

// Every movement of cash at a clinic, oldest first, with a running balance.
// Patient cash receipts and cash expenses come from their own tables.
const CASH_MOVEMENTS = `
  SELECT ce.id, ce.entry_date AS date, ce.type::text AS kind, ce.created_at,
         CASE WHEN ce.type IN ('opening_balance', 'cash_in') THEN ce.amount ELSE -ce.amount END AS amount,
         coalesce(ce.notes, '') AS description, ce.bank_name, ce.reference, true AS editable
    FROM cash_entries ce WHERE ce.clinic_id = :clinicId AND ce.deleted_at IS NULL
  UNION ALL
  SELECT p.id, (p.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'patient_payment', p.created_at, p.amount_paid,
         'Payment from ' || u.fullname, NULL, NULL, false
    FROM treatment_payments p JOIN treatments t ON t.id = p.treatment_id
    JOIN patients pt ON pt.id = t.patient_id JOIN users u ON u.id = pt.user_id
   WHERE t.clinic_id = :clinicId AND p.payment_method = 'cash' AND p.amount_paid > 0
  UNION ALL
  SELECT e.id, e.expense_date, 'expense', e.created_at, -e.amount,
         c.name || coalesce(' · ' || e.vendor, ''), NULL, e.reference, false
    FROM expenses e JOIN expense_categories c ON c.id = e.category_id
   WHERE e.clinic_id = :clinicId AND e.payment_method = 'cash' AND e.deleted_at IS NULL`;

export async function cashBook(ctx, { clinic_id: clinicId, from, to }) {
  await assertClinic(ctx, clinicId);
  const params = { clinicId, from: from ?? null, to: to ?? null };
  const [{ opening }] = await select(
    `SELECT coalesce(sum(amount), 0)::bigint AS opening FROM (${CASH_MOVEMENTS}) m WHERE :from::date IS NOT NULL AND m.date < :from::date`,
    params,
  );
  const rows = await select(
    `SELECT * FROM (${CASH_MOVEMENTS}) m
      WHERE (:from::date IS NULL OR m.date >= :from::date) AND (:to::date IS NULL OR m.date <= :to::date)
      ORDER BY m.date, m.created_at`,
    params,
  );
  let balance = int(opening);
  const totals = { cash_received: 0, cash_in: 0, cash_out: 0, expenses: 0, bank_deposits: 0 };
  const entries = rows.map((r) => {
    const amount = int(r.amount);
    balance += amount;
    if (r.kind === "patient_payment") totals.cash_received += amount;
    if (r.kind === "cash_in" || r.kind === "opening_balance") totals.cash_in += amount;
    if (r.kind === "cash_out") totals.cash_out -= amount;
    if (r.kind === "expense") totals.expenses -= amount;
    if (r.kind === "bank_deposit") totals.bank_deposits -= amount;
    return { ...r, amount, balance };
  });
  return { opening_balance: int(opening), closing_balance: balance, totals, entries: entries.reverse() };
}

export async function createCashEntry(ctx, input) {
  await assertClinic(ctx, input.clinic_id);
  return one(
    `INSERT INTO cash_entries (practice_id, clinic_id, entry_date, type, amount, bank_name, reference, notes, created_by)
     VALUES (:practiceId, :clinic_id, :entry_date, :type, :amount, :bank_name, :reference, :notes, :userId) RETURNING *`,
    { practiceId: ctx.practiceId, userId: ctx.userId, bank_name: null, reference: null, notes: null, ...input },
  );
}

export async function deleteCashEntry(ctx, id) {
  const row = await one(
    `UPDATE cash_entries SET deleted_at = now() WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL RETURNING id`,
    { id, practiceId: ctx.practiceId },
  );
  if (!row) throw notFound("Cash entry not found.");
}

// --- invoices ------------------------------------------------------------------

export function computeTotals({ items, discount = 0, tax_percent: taxPercent = 0 }) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  if (discount > subtotal) throw badRequest("The discount can't be more than the subtotal.");
  const taxAmount = Math.round(((subtotal - discount) * Number(taxPercent)) / 100);
  return { subtotal, discount, tax_amount: taxAmount, total: subtotal - discount + taxAmount };
}

// Paid = what the patient has paid towards the invoice's treatment (cash
// received plus advance used), capped at the invoice total.
const INVOICE_COLUMNS = `
  i.*, u.fullname AS patient_name, u.mobile_number AS patient_phone, cl.name AS clinic_name, cl.address AS clinic_address,
  s.name AS service_name,
  LEAST(i.total, coalesce((SELECT sum(p.amount_paid + coalesce(p.advance_used, 0)) FROM treatment_payments p
                            WHERE p.treatment_id = i.treatment_id), 0))::int AS paid`;
const INVOICE_FROM = `FROM invoices i
  JOIN patients pt ON pt.id = i.patient_id JOIN users u ON u.id = pt.user_id
  JOIN clinics cl ON cl.id = i.clinic_id
  LEFT JOIN treatments t ON t.id = i.treatment_id LEFT JOIN services s ON s.id = t.service_id`;

const withStatus = (row) => {
  const due = row.total - row.paid;
  const paymentStatus = row.status === "cancelled" ? "cancelled" : due <= 0 ? "paid" : row.paid > 0 ? "partially_paid" : "unpaid";
  return { ...row, tax_percent: Number(row.tax_percent), balance_due: Math.max(due, 0), payment_status: paymentStatus };
};

export async function listInvoices(ctx, query) {
  const where = [`i.practice_id = :practiceId`];
  const params = { practiceId: ctx.practiceId, limit: query.limit, offset: (query.page - 1) * query.limit };
  const add = (sql, key, value) => {
    where.push(sql);
    params[key] = value;
  };
  if (query.clinic_id) add(`i.clinic_id = :clinicId`, "clinicId", query.clinic_id);
  if (query.patient_id) add(`i.patient_id = :patientId`, "patientId", query.patient_id);
  if (query.status) add(`i.status = :status`, "status", query.status);
  if (query.from) add(`i.issue_date >= :from`, "from", query.from);
  if (query.to) add(`i.issue_date <= :to`, "to", query.to);
  if (query.q) add(`(i.number ILIKE :q OR u.fullname ILIKE :q OR u.mobile_number ILIKE :q)`, "q", `%${query.q}%`);
  const rows = await select(
    `SELECT ${INVOICE_COLUMNS}, count(*) OVER()::int AS total_count
       ${INVOICE_FROM} WHERE ${where.join(" AND ")}
      ORDER BY i.issue_date DESC, i.number DESC LIMIT :limit OFFSET :offset`,
    params,
  );
  return {
    invoices: rows.map(({ total_count, ...r }) => withStatus(r)),
    meta: { page: query.page, limit: query.limit, total: rows[0]?.total_count ?? 0 },
  };
}

export async function getInvoice(ctx, id) {
  const row = await one(`SELECT ${INVOICE_COLUMNS} ${INVOICE_FROM} WHERE i.id = :id AND i.practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Invoice not found.");
  const payments = row.treatment_id
    ? await select(
        `SELECT id, amount_paid, advance_used, payment_method, payment_type, created_at FROM treatment_payments
          WHERE treatment_id = :treatmentId ORDER BY created_at`,
        { treatmentId: row.treatment_id },
      )
    : [];
  const practice = await one(`SELECT name FROM practices WHERE id = :practiceId`, { practiceId: ctx.practiceId });
  return { ...withStatus(row), payments, practice_name: practice?.name ?? null };
}

export async function createInvoice(ctx, input) {
  await assertClinic(ctx, input.clinic_id);
  const patient = await one(`SELECT id FROM patients WHERE id = :id AND practice_id = :practiceId`, {
    id: input.patient_id,
    practiceId: ctx.practiceId,
  });
  if (!patient) throw notFound("Patient not found.");
  if (input.treatment_id) {
    const treatment = await one(`SELECT patient_id, clinic_id FROM treatments WHERE id = :id`, { id: input.treatment_id });
    if (!treatment || treatment.patient_id !== input.patient_id) throw badRequest("That treatment belongs to another patient.");
    if (treatment.clinic_id !== input.clinic_id) throw badRequest("The invoice's clinic must be the treatment's clinic.");
    const existing = await one(`SELECT number FROM invoices WHERE treatment_id = :id AND status = 'issued'`, { id: input.treatment_id });
    if (existing) throw conflict(`Invoice ${existing.number} already covers this treatment. Cancel it first to issue a new one.`);
  }
  const totals = computeTotals(input);
  const issueDate = input.issue_date ?? today();
  const id = await withTransaction(async (transaction) => {
    const counter = await one(
      `INSERT INTO invoice_counters (practice_id, last_number) VALUES (:practiceId, 1)
       ON CONFLICT (practice_id) DO UPDATE SET last_number = invoice_counters.last_number + 1
       RETURNING last_number`,
      { practiceId: ctx.practiceId },
      { transaction },
    );
    const number = `INV-${issueDate.slice(0, 4)}-${String(counter.last_number).padStart(4, "0")}`;
    const row = await one(
      `INSERT INTO invoices (practice_id, clinic_id, patient_id, treatment_id, number, issue_date, due_date, items,
                             subtotal, discount, tax_percent, tax_amount, total, notes, created_by)
       VALUES (:practiceId, :clinicId, :patientId, :treatmentId, :number, :issueDate, :dueDate, :items::jsonb,
               :subtotal, :discount, :taxPercent, :taxAmount, :total, :notes, :userId)
       RETURNING id`,
      {
        practiceId: ctx.practiceId,
        clinicId: input.clinic_id,
        patientId: input.patient_id,
        treatmentId: input.treatment_id ?? null,
        number,
        issueDate,
        dueDate: input.due_date ?? null,
        items: JSON.stringify(input.items),
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxPercent: input.tax_percent ?? 0,
        taxAmount: totals.tax_amount,
        total: totals.total,
        notes: input.notes ?? null,
        userId: ctx.userId,
      },
      { transaction },
    );
    return row.id;
  });
  return getInvoice(ctx, id);
}

export async function cancelInvoice(ctx, id, { reason }) {
  const row = await one(
    `UPDATE invoices SET status = 'cancelled', cancelled_reason = :reason, updated_at = now()
      WHERE id = :id AND practice_id = :practiceId AND status = 'issued' RETURNING id`,
    { id, practiceId: ctx.practiceId, reason },
  );
  if (!row) throw badRequest("Only an issued invoice can be cancelled.");
  return getInvoice(ctx, id);
}

// What an invoice for a treatment would contain: its plan cost as one line.
export async function invoiceDraftForTreatment(ctx, treatmentId) {
  const row = await one(
    `SELECT t.id, t.clinic_id, t.patient_id, s.name AS service_name,
            (SELECT coalesce(sum(total_cost), 0)::int FROM treatment_plans tp WHERE tp.treatment_id = t.id) AS plan_cost
       FROM treatments t JOIN services s ON s.id = t.service_id
      WHERE t.id = :id AND t.practice_id = :practiceId`,
    { id: treatmentId, practiceId: ctx.practiceId },
  );
  if (!row) throw notFound("Treatment not found.");
  return {
    clinic_id: row.clinic_id,
    patient_id: row.patient_id,
    treatment_id: row.id,
    items: [{ description: row.service_name, quantity: 1, unit_price: row.plan_cost }],
  };
}

// --- income & expenditure --------------------------------------------------------

export async function summary(ctx, { clinic_id: clinicId, from, to }) {
  const params = { practiceId: ctx.practiceId, clinicId: clinicId ?? null, from: from ?? null, to: to ?? null };
  const paymentWhere = `t.practice_id = :practiceId AND p.amount_paid > 0
    AND (:clinicId::uuid IS NULL OR t.clinic_id = :clinicId)
    AND (:from::date IS NULL OR (p.created_at AT TIME ZONE 'Asia/Kolkata')::date >= :from::date)
    AND (:to::date IS NULL OR (p.created_at AT TIME ZONE 'Asia/Kolkata')::date <= :to::date)`;
  const expenseWhere = `e.practice_id = :practiceId AND e.deleted_at IS NULL
    AND (:clinicId::uuid IS NULL OR e.clinic_id = :clinicId)
    AND (:from::date IS NULL OR e.expense_date >= :from::date)
    AND (:to::date IS NULL OR e.expense_date <= :to::date)`;

  const [incomeByMethod, expenseByCategory, incomeByMonth, expenseByMonth, incomeByService] = await Promise.all([
    select(
      `SELECT p.payment_method AS method, sum(p.amount_paid)::bigint AS amount, count(*)::int AS count
         FROM treatment_payments p JOIN treatments t ON t.id = p.treatment_id WHERE ${paymentWhere}
        GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    select(
      `SELECT c.id, c.name, c.color, sum(e.amount)::bigint AS amount, count(*)::int AS count
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE ${expenseWhere}
        GROUP BY c.id ORDER BY 4 DESC`,
      params,
    ),
    select(
      `SELECT to_char(date_trunc('month', p.created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month, sum(p.amount_paid)::bigint AS amount
         FROM treatment_payments p JOIN treatments t ON t.id = p.treatment_id WHERE ${paymentWhere} GROUP BY 1`,
      params,
    ),
    select(`SELECT to_char(date_trunc('month', e.expense_date), 'YYYY-MM') AS month, sum(e.amount)::bigint AS amount FROM expenses e WHERE ${expenseWhere} GROUP BY 1`, params),
    select(
      `SELECT s.name, sum(p.amount_paid)::bigint AS amount
         FROM treatment_payments p JOIN treatments t ON t.id = p.treatment_id JOIN services s ON s.id = t.service_id
        WHERE ${paymentWhere} GROUP BY s.name ORDER BY 2 DESC LIMIT 10`,
      params,
    ),
  ]);

  const months = [...new Set([...incomeByMonth, ...expenseByMonth].map((r) => r.month))].sort();
  const byMonth = months.map((month) => {
    const income = int(incomeByMonth.find((r) => r.month === month)?.amount);
    const expenses = int(expenseByMonth.find((r) => r.month === month)?.amount);
    return { month, income, expenses, net: income - expenses };
  });
  const income = incomeByMethod.reduce((s, r) => s + int(r.amount), 0);
  const expenses = expenseByCategory.reduce((s, r) => s + int(r.amount), 0);
  return {
    income,
    expenses,
    net: income - expenses,
    income_by_method: incomeByMethod.map((r) => ({ ...r, amount: int(r.amount) })),
    income_by_service: incomeByService.map((r) => ({ ...r, amount: int(r.amount) })),
    expenses_by_category: expenseByCategory.map((r) => ({ ...r, amount: int(r.amount) })),
    by_month: byMonth,
  };
}
