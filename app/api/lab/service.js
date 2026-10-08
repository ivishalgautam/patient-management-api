"use strict";
// Dental lab management: labs and lab orders (crowns, bridges, dentures…)
// from draft to sent, received and fitted, with remakes, due dates, status
// history and the lab bill (optionally recorded as a "Lab charges" expense).
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/app-error.js";
import { can } from "../../lib/permissions.js";
import { clinicToday } from "../../lib/booking-rules.js";
import { recordExpense } from "../accounts/service.js";

export const WORK_TYPES = [
  "Crown",
  "Bridge",
  "Veneer",
  "Inlay / onlay",
  "Implant crown",
  "Complete denture",
  "Partial denture",
  "Night guard",
  "Clear aligners",
  "Retainer",
  "Other",
];

// Allowed next statuses and the date each one stamps.
const FLOW = {
  draft: ["sent", "cancelled"],
  sent: ["received", "cancelled"],
  received: ["fitted", "remake"],
  remake: ["received", "cancelled"],
  fitted: ["remake"],
  cancelled: [],
};
const STAMP = { sent: "sent_date", received: "received_date", fitted: "fitted_date" };
const rule = (message, code) => new AppError(400, message, { code });

// --- labs ------------------------------------------------------------------------

export function listLabs(ctx, { includeArchived = false } = {}) {
  return select(
    `SELECT l.*,
            (SELECT count(*)::int FROM lab_orders o WHERE o.lab_id = l.id AND o.status IN ('sent', 'remake')) AS open_orders,
            (SELECT coalesce(sum(o.lab_cost), 0)::int FROM lab_orders o WHERE o.lab_id = l.id AND o.paid_at IS NULL
               AND o.status IN ('received', 'fitted')) AS unpaid_amount
       FROM labs l WHERE l.practice_id = :practiceId ${includeArchived ? "" : "AND l.archived_at IS NULL"}
      ORDER BY l.archived_at NULLS FIRST, lower(l.name)`,
    { practiceId: ctx.practiceId },
  );
}

async function assertLabName(ctx, name, exceptId = null) {
  const taken = await one(
    `SELECT 1 FROM labs WHERE practice_id = :practiceId AND lower(name) = lower(:name) AND archived_at IS NULL
        AND (:exceptId::uuid IS NULL OR id <> :exceptId)`,
    { practiceId: ctx.practiceId, name, exceptId },
  );
  if (taken) throw conflict(`There's already a lab called "${name}".`);
}

export async function createLab(ctx, input) {
  await assertLabName(ctx, input.name);
  return one(
    `INSERT INTO labs (practice_id, name, contact_person, phone, email, address, notes)
     VALUES (:practiceId, :name, :contact_person, :phone, :email, :address, :notes) RETURNING *`,
    { practiceId: ctx.practiceId, contact_person: null, phone: null, email: null, address: null, notes: null, ...input },
  );
}

export async function updateLab(ctx, id, input) {
  const lab = await one(`SELECT * FROM labs WHERE id = :id AND practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!lab) throw notFound("Lab not found.");
  if (input.name || input.archived === false) await assertLabName(ctx, input.name ?? lab.name, id);
  const next = { ...lab, ...input };
  return one(
    `UPDATE labs SET name = :name, contact_person = :contact_person, phone = :phone, email = :email, address = :address, notes = :notes,
            archived_at = CASE WHEN :archived::boolean IS NULL THEN archived_at WHEN :archived THEN coalesce(archived_at, now()) ELSE NULL END
      WHERE id = :id RETURNING *`,
    {
      id,
      name: next.name,
      contact_person: next.contact_person,
      phone: next.phone,
      email: next.email,
      address: next.address,
      notes: next.notes,
      archived: input.archived ?? null,
    },
  );
}

// --- orders ----------------------------------------------------------------------

const ORDER_COLUMNS = `
  o.*, to_char(o.sent_date, 'YYYY-MM-DD') AS sent_date, to_char(o.due_date, 'YYYY-MM-DD') AS due_date,
  to_char(o.received_date, 'YYYY-MM-DD') AS received_date, to_char(o.fitted_date, 'YYYY-MM-DD') AS fitted_date,
  l.name AS lab_name, l.phone AS lab_phone, u.fullname AS patient_name, u.mobile_number AS patient_phone,
  cl.name AS clinic_name, s.name AS service_name,
  (o.status IN ('sent', 'remake') AND o.due_date < :today::date) AS overdue`;
const ORDER_FROM = `FROM lab_orders o
  JOIN labs l ON l.id = o.lab_id
  JOIN patients p ON p.id = o.patient_id JOIN users u ON u.id = p.user_id
  JOIN clinics cl ON cl.id = o.clinic_id
  LEFT JOIN treatments t ON t.id = o.treatment_id LEFT JOIN services s ON s.id = t.service_id`;

export async function listOrders(ctx, query) {
  const today = await clinicToday();
  const where = [`o.practice_id = :practiceId`];
  const params = { practiceId: ctx.practiceId, today, limit: query.limit, offset: (query.page - 1) * query.limit };
  const add = (sql, key, value) => {
    where.push(sql);
    params[key] = value;
  };
  if (query.clinic_id) add(`o.clinic_id = :clinicId`, "clinicId", query.clinic_id);
  if (query.lab_id) add(`o.lab_id = :labId`, "labId", query.lab_id);
  if (query.patient_id) add(`o.patient_id = :patientId`, "patientId", query.patient_id);
  if (query.status === "open") where.push(`o.status IN ('draft', 'sent', 'remake', 'received')`);
  else if (query.status === "overdue") where.push(`o.status IN ('sent', 'remake') AND o.due_date < :today::date`);
  else if (query.status === "unpaid") where.push(`o.paid_at IS NULL AND o.lab_cost > 0 AND o.status IN ('received', 'fitted')`);
  else if (query.status) add(`o.status = :status`, "status", query.status);
  if (query.q) add(`(o.number ILIKE :q OR u.fullname ILIKE :q OR o.work_type ILIKE :q)`, "q", `%${query.q}%`);
  const rows = await select(
    `SELECT ${ORDER_COLUMNS}, count(*) OVER()::int AS total_count ${ORDER_FROM}
      WHERE ${where.join(" AND ")}
      ORDER BY (o.status IN ('sent', 'remake') AND o.due_date < :today::date) DESC, o.due_date NULLS LAST, o.created_at DESC
      LIMIT :limit OFFSET :offset`,
    params,
  );
  const [counts] = await select(
    `SELECT count(*) FILTER (WHERE status IN ('draft', 'sent', 'remake', 'received'))::int AS open,
            count(*) FILTER (WHERE status IN ('sent', 'remake') AND due_date < :today::date)::int AS overdue,
            count(*) FILTER (WHERE status IN ('sent', 'remake') AND due_date = :today::date)::int AS due_today,
            count(*) FILTER (WHERE status = 'received')::int AS ready_to_fit,
            coalesce(sum(lab_cost) FILTER (WHERE paid_at IS NULL AND status IN ('received', 'fitted')), 0)::int AS unpaid
       FROM lab_orders WHERE practice_id = :practiceId AND (:clinicId::uuid IS NULL OR clinic_id = :clinicId)`,
    { practiceId: ctx.practiceId, today, clinicId: query.clinic_id ?? null },
  );
  return { orders: rows.map(({ total_count, ...o }) => o), meta: { page: query.page, limit: query.limit, total: rows[0]?.total_count ?? 0, counts } };
}

export async function getOrder(ctx, id) {
  const order = await one(`SELECT ${ORDER_COLUMNS} ${ORDER_FROM} WHERE o.id = :id AND o.practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
    today: await clinicToday(),
  });
  if (!order) throw notFound("Lab order not found.");
  const events = await select(
    `SELECT e.*, u.fullname AS created_by_name FROM lab_order_events e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.order_id = :id ORDER BY e.created_at`,
    { id },
  );
  return { ...order, events, next_statuses: FLOW[order.status] };
}

async function checkRefs(ctx, input) {
  const clinic = await one(`SELECT 1 FROM clinics WHERE id = :id AND practice_id = :practiceId`, { id: input.clinic_id, practiceId: ctx.practiceId });
  if (!clinic) throw notFound("Clinic not found.");
  const lab = await one(`SELECT archived_at FROM labs WHERE id = :id AND practice_id = :practiceId`, { id: input.lab_id, practiceId: ctx.practiceId });
  if (!lab) throw notFound("Lab not found.");
  if (lab.archived_at) throw badRequest("That lab is archived.");
  const patient = await one(`SELECT 1 FROM patients WHERE id = :id AND practice_id = :practiceId`, { id: input.patient_id, practiceId: ctx.practiceId });
  if (!patient) throw notFound("Patient not found.");
  if (input.treatment_id) {
    const t = await one(`SELECT patient_id FROM treatments WHERE id = :id`, { id: input.treatment_id });
    if (!t || t.patient_id !== input.patient_id) throw badRequest("That treatment belongs to another patient.");
  }
}

export async function createOrder(ctx, input) {
  await checkRefs(ctx, input);
  if (input.due_date && input.sent_date && input.due_date < input.sent_date) throw badRequest("The due date is before the date it was sent.");
  const status = input.send_now ? "sent" : "draft";
  const today = await clinicToday();
  const id = await withTransaction(async (transaction) => {
    const counter = await one(
      `INSERT INTO lab_order_counters (practice_id, last_number) VALUES (:practiceId, 1)
       ON CONFLICT (practice_id) DO UPDATE SET last_number = lab_order_counters.last_number + 1 RETURNING last_number`,
      { practiceId: ctx.practiceId },
      { transaction },
    );
    const row = await one(
      `INSERT INTO lab_orders (practice_id, clinic_id, lab_id, patient_id, treatment_id, number, work_type, teeth, shade, material,
                               instructions, status, sent_date, due_date, lab_cost, created_by)
       VALUES (:practiceId, :clinic_id, :lab_id, :patient_id, :treatment_id, :number, :work_type, :teeth, :shade, :material,
               :instructions, :status, :sentDate, :due_date, :lab_cost, :userId) RETURNING id`,
      {
        practiceId: ctx.practiceId,
        treatment_id: null,
        teeth: null,
        shade: null,
        material: null,
        instructions: null,
        due_date: null,
        lab_cost: null,
        ...input,
        number: `LAB-${String(counter.last_number).padStart(4, "0")}`,
        status,
        sentDate: status === "sent" ? (input.sent_date ?? today) : null,
        userId: ctx.userId,
      },
      { transaction },
    );
    await exec(
      `INSERT INTO lab_order_events (order_id, status, note, created_by) VALUES (:id, :status, :note, :userId)`,
      { id: row.id, status, note: status === "sent" ? "Sent to the lab" : "Order created", userId: ctx.userId },
      { transaction },
    );
    return row.id;
  });
  return getOrder(ctx, id);
}

export async function updateOrder(ctx, id, input) {
  const order = await getOrder(ctx, id);
  if (order.status === "cancelled") throw rule("This order was cancelled.", "LAB_ORDER_CLOSED");
  const next = { ...order, ...input };
  if (next.due_date && next.sent_date && next.due_date < next.sent_date) throw badRequest("The due date is before the date it was sent.");
  await exec(
    `UPDATE lab_orders SET work_type = :work_type, teeth = :teeth, shade = :shade, material = :material, instructions = :instructions,
            due_date = :due_date, lab_cost = :lab_cost, updated_at = now()
      WHERE id = :id`,
    {
      id,
      work_type: next.work_type,
      teeth: next.teeth ?? null,
      shade: next.shade ?? null,
      material: next.material ?? null,
      instructions: next.instructions ?? null,
      due_date: next.due_date ?? null,
      lab_cost: next.lab_cost ?? null,
    },
  );
  return getOrder(ctx, id);
}

export async function changeStatus(ctx, id, { status, note, date, due_date: dueDate }) {
  const order = await getOrder(ctx, id);
  if (!FLOW[order.status].includes(status)) {
    throw rule(`A ${order.status} order can't be marked ${status}.`, "LAB_STATUS_NOT_ALLOWED");
  }
  if (status === "remake" && !note?.trim()) throw badRequest("Say what needs to be redone.");
  const day = date ?? (await clinicToday());
  const column = STAMP[status];
  await withTransaction(async (transaction) => {
    await exec(
      `UPDATE lab_orders SET status = :status, updated_at = now()
              ${column ? `, ${column} = :day` : ""}
              ${status === "remake" ? ", received_date = NULL, fitted_date = NULL, sent_date = :day" : ""}
              ${dueDate ? ", due_date = :dueDate" : ""}
        WHERE id = :id`,
      { id, status, day, dueDate: dueDate ?? null },
      { transaction },
    );
    await exec(
      `INSERT INTO lab_order_events (order_id, status, note, created_by) VALUES (:id, :status, :note, :userId)`,
      { id, status, note: note?.trim() || null, userId: ctx.userId },
      { transaction },
    );
  });
  return getOrder(ctx, id);
}

export async function markPaid(ctx, id, { create_expense: createExpense = false, payment_method: method = "bank_transfer", date }) {
  const order = await getOrder(ctx, id);
  if (order.paid_at) throw conflict("This lab bill is already marked paid.");
  if (!order.lab_cost) throw badRequest("Enter the lab's charge first.");
  if (!["received", "fitted"].includes(order.status)) throw rule("Mark the work received before paying the lab.", "LAB_NOT_RECEIVED");
  let expenseId = null;
  if (createExpense) {
    if (!can(ctx, "accounts.manage")) throw forbidden("You can't record expenses.");
    const expense = await recordExpense(ctx, {
      categoryName: "Lab charges",
      clinic_id: order.clinic_id,
      expense_date: date ?? (await clinicToday()),
      amount: order.lab_cost,
      payment_method: method,
      vendor: order.lab_name,
      reference: order.number,
      notes: `${order.work_type} for ${order.patient_name}`,
    });
    expenseId = expense.id;
  }
  await exec(`UPDATE lab_orders SET paid_at = now(), expense_id = :expenseId, updated_at = now() WHERE id = :id`, { id, expenseId });
  return getOrder(ctx, id);
}
