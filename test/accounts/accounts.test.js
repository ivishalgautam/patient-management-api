import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api, createPatient } from "../setup/factories.js";

let app;
let A;
let B;
let doctor;
let staff;
let treatmentId;
let category;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  await resetDb();
  app = await buildTestApp();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  staff = api(app, A.staff.token);
  ok(await doctor.post("/v1/treatments", { clinic_id: A.clinic.id, patient_id: A.patient.id, service_id: A.service.id }));
  [{ id: treatmentId }] = await query(`SELECT id FROM treatments WHERE patient_id = :pid`, { pid: A.patient.id });
  ok(await doctor.post("/v1/treatment-plans", { treatment_id: treatmentId, patient_id: A.patient.id, total_cost: 10000, notes: [], affected_tooths: [] }));
  ok(await doctor.post("/v1/treatment-payments", {
    treatment_id: treatmentId,
    clinic_id: A.clinic.id,
    payment_type: "installment",
    payment_method: "cash",
    amount_paid: 4000,
  }));
  ok(await doctor.post("/v1/treatment-payments", {
    treatment_id: treatmentId,
    clinic_id: A.clinic.id,
    payment_type: "installment",
    payment_method: "upi",
    amount_paid: 1000,
  }));
});
afterAll(async () => app?.close());

describe("expense categories", () => {
  it("gives every practice the default categories", async () => {
    const list = ok(await doctor.get("/v1/accounts/expense-categories"));
    expect(list.map((c) => c.name)).toContain("Lab charges");
    category = list.find((c) => c.name === "Dental materials");
  });

  it("rejects a duplicate name and archives instead of deleting", async () => {
    expect((await doctor.post("/v1/accounts/expense-categories", { name: "rent" })).statusCode).toBe(409);
    const added = ok(await doctor.post("/v1/accounts/expense-categories", { name: "Courier", color: "#112233" }));
    ok(await doctor.put(`/v1/accounts/expense-categories/${added.id}`, { archived: true }));
    const active = ok(await doctor.get("/v1/accounts/expense-categories"));
    expect(active.find((c) => c.id === added.id)).toBeUndefined();
    const res = await doctor.post("/v1/accounts/expenses", { clinic_id: A.clinic.id, category_id: added.id, expense_date: today, amount: 50 });
    expect(res.statusCode).toBe(400);
  });
});

describe("expenses", () => {
  it("records, filters, edits and deletes expenses", async () => {
    const e = ok(await doctor.post("/v1/accounts/expenses", {
      clinic_id: A.clinic.id,
      category_id: category.id,
      expense_date: today,
      amount: 1500,
      payment_method: "cash",
      vendor: "Dental Depot",
    }));
    expect(e).toMatchObject({ amount: 1500, category_name: "Dental materials", clinic_name: "Smile Clinic" });
    ok(await doctor.post("/v1/accounts/expenses", { clinic_id: A.clinic.id, category_id: category.id, expense_date: today, amount: 700, payment_method: "upi" }));

    const res = await doctor.get(`/v1/accounts/expenses?payment_method=cash&q=depot`);
    expect(res.json().meta).toMatchObject({ total: 1, total_amount: 1500 });

    expect(ok(await doctor.put(`/v1/accounts/expenses/${e.id}`, { amount: 1200 })).amount).toBe(1200);
    const extra = ok(await doctor.post("/v1/accounts/expenses", { clinic_id: A.clinic.id, category_id: category.id, expense_date: today, amount: 99 }));
    ok(await doctor.delete(`/v1/accounts/expenses/${extra.id}`));
    expect((await doctor.get(`/v1/accounts/expenses`)).json().meta.total).toBe(2);
  });

  it("rejects bad amounts and is limited to the doctor by default", async () => {
    const bad = await doctor.post("/v1/accounts/expenses", { clinic_id: A.clinic.id, category_id: category.id, expense_date: today, amount: -5 });
    expect(bad.statusCode).toBe(400);
    expect((await staff.get("/v1/accounts/expenses")).statusCode).toBe(403);
  });

  it("keeps practices apart", async () => {
    const other = api(app, B.doctor.token);
    expect((await other.post("/v1/accounts/expenses", { clinic_id: A.clinic.id, category_id: category.id, expense_date: today, amount: 10 })).statusCode).toBe(404);
    expect(ok(await other.get("/v1/accounts/expenses"))).toHaveLength(0);
  });
});

describe("cash book", () => {
  it("combines patient cash, cash expenses and manual entries into a running balance", async () => {
    ok(await doctor.post("/v1/accounts/cash-entries", { clinic_id: A.clinic.id, entry_date: today, type: "opening_balance", amount: 2000 }));
    expect((await doctor.post("/v1/accounts/cash-entries", { clinic_id: A.clinic.id, entry_date: today, type: "bank_deposit", amount: 3000 })).statusCode).toBe(400);
    ok(await doctor.post("/v1/accounts/cash-entries", { clinic_id: A.clinic.id, entry_date: today, type: "bank_deposit", amount: 3000, bank_name: "HDFC" }));

    const book = ok(await doctor.get(`/v1/accounts/cash-book?clinic_id=${A.clinic.id}`));
    // 2000 opening + 4000 patient cash - 1200 cash expense - 3000 deposit (the UPI payment and UPI expense don't touch cash)
    expect(book.closing_balance).toBe(1800);
    expect(book.totals).toMatchObject({ cash_received: 4000, expenses: 1200, bank_deposits: 3000 });
    expect(book.entries[0].balance).toBe(1800);
  });

  it("starts the book at the latest opening balance", async () => {
    const lastYear = `${Number(today.slice(0, 4)) - 1}-01-15`;
    ok(await doctor.post("/v1/accounts/expenses", { clinic_id: A.clinic.id, category_id: category.id, expense_date: lastYear, amount: 5000 }));
    const book = ok(await doctor.get(`/v1/accounts/cash-book?clinic_id=${A.clinic.id}`));
    expect(book.started_on).toBe(today);
    expect(book.closing_balance).toBe(1800);
    expect(book.entries.at(-1).kind).toBe("opening_balance");
  });

  it("carries earlier movements into the opening balance of a later range", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const book = ok(await doctor.get(`/v1/accounts/cash-book?clinic_id=${A.clinic.id}&from=${tomorrow}`));
    expect(book).toMatchObject({ opening_balance: 1800, closing_balance: 1800, entries: [] });
  });
});

describe("invoices", () => {
  it("drafts from the treatment plan and numbers invoices per practice", async () => {
    const draft = ok(await doctor.get(`/v1/accounts/treatments/${treatmentId}/invoice-draft`));
    expect(draft.items[0].unit_price).toBe(10000);
    const inv = ok(await doctor.post("/v1/accounts/invoices", { ...draft, discount: 1000, tax_percent: 0 }));
    expect(inv).toMatchObject({ number: `INV-${today.slice(0, 4)}-0001`, subtotal: 10000, total: 9000, paid: 5000, balance_due: 4000, payment_status: "partially_paid" });
    expect(inv.payments).toHaveLength(2);

    expect((await doctor.post("/v1/accounts/invoices", draft)).statusCode).toBe(409);
    ok(await doctor.post(`/v1/accounts/invoices/${inv.id}/cancel`, { reason: "Wrong discount" }));
    const again = ok(await doctor.post("/v1/accounts/invoices", draft));
    expect(again.number).toBe(`INV-${today.slice(0, 4)}-0002`);
  });

  it("issues a standalone invoice with tax, and staff with billing can too", async () => {
    const other = await createPatient(app, A.doctor.token, { fullname: "Ravi Kumar" });
    const inv = ok(await staff.post("/v1/accounts/invoices", {
      clinic_id: A.clinic.id,
      patient_id: other.id,
      items: [{ description: "Scaling", quantity: 1, unit_price: 1000 }, { description: "X-ray", quantity: 2, unit_price: 250 }],
      tax_percent: 18,
    }));
    expect(inv).toMatchObject({ subtotal: 1500, tax_amount: 270, total: 1770, paid: 0, payment_status: "unpaid" });
    const list = await doctor.get(`/v1/accounts/invoices?q=ravi`);
    expect(list.json().meta.total).toBe(1);
  });

  it("refuses a treatment of another patient and other practices' invoices", async () => {
    const other = await createPatient(app, A.doctor.token, { fullname: "Meena" });
    const res = await doctor.post("/v1/accounts/invoices", {
      clinic_id: A.clinic.id,
      patient_id: other.id,
      treatment_id: treatmentId,
      items: [{ description: "x", quantity: 1, unit_price: 1 }],
    });
    expect(res.statusCode).toBe(400);
    const [inv] = await query(`SELECT id FROM invoices LIMIT 1`);
    expect((await api(app, B.doctor.token).get(`/v1/accounts/invoices/${inv.id}`)).statusCode).toBe(404);
  });
});

describe("income & expenditure", () => {
  it("sums income by method and expenses by category", async () => {
    const s = ok(await doctor.get(`/v1/accounts/summary?from=${today}&to=${today}`));
    expect(s).toMatchObject({ income: 5000, expenses: 1900, net: 3100 });
    expect(s.income_by_method.find((m) => m.method === "cash").amount).toBe(4000);
    expect(s.expenses_by_category[0]).toMatchObject({ name: "Dental materials", amount: 1900 });
    expect(s.by_month).toEqual([{ month: today.slice(0, 7), income: 5000, expenses: 1900, net: 3100 }]);
    expect((await staff.get("/v1/accounts/summary")).statusCode).toBe(403);
  });
});
