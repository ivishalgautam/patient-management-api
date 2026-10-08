import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb, query } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";
import { clinicToday } from "../../app/lib/booking-rules.js";

let app;
let A;
let B;
let doctor;
let staff;
let today;

const ok = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(400);
  return res.json().data;
};

beforeAll(async () => {
  await resetDb();
  app = await buildTestApp();
  A = await setupPractice(app);
  B = await setupPractice(app);
  doctor = api(app, A.doctor.token);
  staff = api(app, A.staff.token);
  today = await clinicToday();
});
afterAll(async () => app?.close());

describe("inventory", () => {
  let supplier;
  let item;

  it("adds suppliers and items with opening stock", async () => {
    supplier = ok(await staff.post("/v1/inventory/suppliers", { name: "Dental Depot", phone: "9811111111", email: "" }));
    expect((await staff.post("/v1/inventory/suppliers", { name: "dental depot" })).statusCode).toBe(409);
    item = ok(
      await staff.post("/v1/inventory/items", {
        clinic_id: A.clinic.id,
        name: "Composite A2",
        category: "Restorative materials",
        unit: "syringe",
        reorder_level: 3,
        unit_cost: 450,
        supplier_id: supplier.id,
        opening_stock: 5,
      }),
    );
    expect(item).toMatchObject({ current_stock: 5, low_stock: false, supplier_name: "Dental Depot" });
    expect((await staff.post("/v1/inventory/items", { clinic_id: A.clinic.id, name: "composite a2" })).statusCode).toBe(409);
  });

  it("records use, wastage and purchases and never goes below zero", async () => {
    expect(ok(await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "used", quantity: 2 })).current_stock).toBe(3);
    const low = ok(await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "wasted", quantity: 1, notes: "Expired" }));
    expect(low).toMatchObject({ current_stock: 2, low_stock: true });
    const tooMany = await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "used", quantity: 5 });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().code).toBe("STOCK_TOO_LOW");
    expect((await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "adjustment", quantity: -1 })).statusCode).toBe(400);
    ok(await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "adjustment", quantity: -1, notes: "Counted 1" }));

    const expiry = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    const bought = ok(
      await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "purchase", quantity: 10, unit_cost: 500, supplier_id: supplier.id, expiry_date: expiry }),
    );
    expect(bought).toMatchObject({ current_stock: 11, unit_cost: 500, low_stock: false });
    const [{ sum }] = await query(`SELECT sum(quantity)::int AS sum FROM stock_movements WHERE item_id = :id`, { id: item.id });
    expect(sum).toBe(11);
    expect(ok(await staff.get(`/v1/inventory/items/${item.id}/movements`))).toHaveLength(5);
  });

  it("adds a purchase to expenses only for people who manage accounts", async () => {
    const res = await staff.post(`/v1/inventory/items/${item.id}/movements`, { type: "purchase", quantity: 2, unit_cost: 500, create_expense: true });
    expect(res.statusCode).toBe(403);
    const [{ n: before }] = await query(`SELECT count(*)::int AS n FROM stock_movements WHERE item_id = :id`, { id: item.id });
    expect(before).toBe(5);
    ok(await doctor.post(`/v1/inventory/items/${item.id}/movements`, { type: "purchase", quantity: 2, unit_cost: 500, supplier_id: supplier.id, create_expense: true }));
    const [expense] = await query(
      `SELECT e.amount, e.vendor, c.name AS category FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.practice_id = c.practice_id`,
    );
    expect(expense).toMatchObject({ amount: 1000, vendor: "Dental Depot", category: "Dental materials" });
  });

  it("lists low stock and reports usage, wastage and expiry", async () => {
    ok(await staff.post("/v1/inventory/items", { clinic_id: A.clinic.id, name: "Gloves M", unit: "box", reorder_level: 2 }));
    const low = ok(await staff.get(`/v1/inventory/items?clinic_id=${A.clinic.id}&low_stock=true`));
    expect(low.map((i) => i.name)).toEqual(["Gloves M"]);
    const report = ok(await staff.get(`/v1/inventory/report?clinic_id=${A.clinic.id}&from=${today}&to=${today}`));
    expect(report.totals).toMatchObject({ items: 2, low_stock: 1, stock_value: 13 * 500 });
    expect(report.usage[0]).toMatchObject({ name: "Composite A2", used: 2, wasted: 1, purchased: 12 });
    expect(report.expiring.map((e) => e.name)).toEqual(["Composite A2"]);
  });

  it("keeps practices apart", async () => {
    const other = api(app, B.doctor.token);
    expect((await other.post(`/v1/inventory/items/${item.id}/movements`, { type: "used", quantity: 1 })).statusCode).toBe(404);
    expect((await other.get(`/v1/inventory/items?clinic_id=${A.clinic.id}`)).statusCode).toBe(404);
    expect(ok(await other.get("/v1/inventory/suppliers"))).toHaveLength(0);
  });
});

describe("lab orders", () => {
  let lab;
  let order;

  it("creates labs and numbered orders", async () => {
    lab = ok(await staff.post("/v1/lab/labs", { name: "Precision Dental Lab", phone: "9822222222" }));
    const due = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    order = ok(
      await staff.post("/v1/lab/orders", {
        clinic_id: A.clinic.id,
        lab_id: lab.id,
        patient_id: A.patient.id,
        work_type: "Crown",
        teeth: "36",
        shade: "A2",
        material: "Zirconia",
        due_date: due,
        lab_cost: 3500,
        send_now: true,
      }),
    );
    expect(order).toMatchObject({ number: "LAB-0001", status: "sent", sent_date: today, lab_name: "Precision Dental Lab", overdue: false });
    expect(order.next_statuses).toEqual(["received", "cancelled"]);
    const draft = ok(await staff.post("/v1/lab/orders", { clinic_id: A.clinic.id, lab_id: lab.id, patient_id: A.patient.id, work_type: "Night guard" }));
    expect(draft).toMatchObject({ number: "LAB-0002", status: "draft" });
  });

  it("moves through the allowed statuses only", async () => {
    expect((await staff.post(`/v1/lab/orders/${order.id}/status`, { status: "fitted" })).json().code).toBe("LAB_STATUS_NOT_ALLOWED");
    expect(ok(await staff.post(`/v1/lab/orders/${order.id}/status`, { status: "received" }))).toMatchObject({ status: "received", received_date: today });
    expect((await staff.post(`/v1/lab/orders/${order.id}/status`, { status: "remake" })).statusCode).toBe(400);
    const remake = ok(await staff.post(`/v1/lab/orders/${order.id}/status`, { status: "remake", note: "Shade too light" }));
    expect(remake).toMatchObject({ status: "remake", received_date: null });
    ok(await staff.post(`/v1/lab/orders/${order.id}/status`, { status: "received" }));
    const fitted = ok(await staff.post(`/v1/lab/orders/${order.id}/status`, { status: "fitted" }));
    expect(fitted.events.map((e) => e.status)).toEqual(["sent", "received", "remake", "received", "fitted"]);
  });

  it("flags overdue work and pays the lab bill", async () => {
    const late = ok(await staff.post("/v1/lab/orders", { clinic_id: A.clinic.id, lab_id: lab.id, patient_id: A.patient.id, work_type: "Bridge", send_now: true }));
    await query(`UPDATE lab_orders SET due_date = current_date - 3 WHERE id = :id`, { id: late.id });
    const list = await staff.get(`/v1/lab/orders?status=overdue`);
    expect(list.json().data.map((o) => o.number)).toEqual([late.number]);
    expect(list.json().meta.counts).toMatchObject({ overdue: 1, unpaid: 3500 });

    expect((await staff.post(`/v1/lab/orders/${order.id}/paid`, { create_expense: true })).statusCode).toBe(403);
    const paid = ok(await doctor.post(`/v1/lab/orders/${order.id}/paid`, { create_expense: true, payment_method: "upi" }));
    expect(paid.paid_at).toBeTruthy();
    const [expense] = await query(`SELECT e.amount, e.reference, c.name FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = :id`, {
      id: paid.expense_id,
    });
    expect(expense).toMatchObject({ amount: 3500, reference: "LAB-0001", name: "Lab charges" });
    expect((await doctor.post(`/v1/lab/orders/${order.id}/paid`, {})).statusCode).toBe(409);
  });

  it("keeps practices apart", async () => {
    const other = api(app, B.doctor.token);
    expect((await other.get(`/v1/lab/orders/${order.id}`)).statusCode).toBe(404);
    expect((await other.post("/v1/lab/orders", { clinic_id: B.clinic.id, lab_id: lab.id, patient_id: B.patient.id, work_type: "Crown" })).statusCode).toBe(404);
  });
});
