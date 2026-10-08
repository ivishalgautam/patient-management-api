"use strict";
// Inventory: suppliers, stock items per clinic and stock movements
// (purchase, used, wasted, adjustment). current_stock always equals the
// sum of the item's movements; stock can't go below zero.
import { select, one, exec, withTransaction } from "../../db/sql.js";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "../../lib/app-error.js";
import { can } from "../../lib/permissions.js";
import { clinicToday } from "../../lib/booking-rules.js";
import { recordExpense } from "../accounts/service.js";

export const CATEGORIES = [
  "Consumables",
  "Restorative materials",
  "Impression materials",
  "Endodontic",
  "Orthodontic",
  "Medicines",
  "Instruments",
  "Sterilisation",
  "Other",
];

async function assertClinic(ctx, clinicId) {
  const row = await one(
    `SELECT 1 FROM clinics WHERE id = :id AND practice_id = :practiceId`,
    { id: clinicId, practiceId: ctx.practiceId },
  );
  if (!row) throw notFound("Clinic not found.");
}

async function assertSupplier(ctx, supplierId) {
  if (!supplierId) return;
  const row = await one(
    `SELECT 1 FROM suppliers WHERE id = :id AND practice_id = :practiceId`,
    { id: supplierId, practiceId: ctx.practiceId },
  );
  if (!row) throw notFound("Supplier not found.");
}

// --- suppliers -------------------------------------------------------------------

export function listSuppliers(ctx, { includeArchived = false } = {}) {
  return select(
    `SELECT s.*, (SELECT count(*)::int FROM inventory_items i WHERE i.supplier_id = s.id AND i.archived_at IS NULL) AS item_count
       FROM suppliers s WHERE s.practice_id = :practiceId ${includeArchived ? "" : "AND s.archived_at IS NULL"}
      ORDER BY s.archived_at NULLS FIRST, lower(s.name)`,
    { practiceId: ctx.practiceId },
  );
}

async function assertSupplierName(ctx, name, exceptId = null) {
  const taken = await one(
    `SELECT 1 FROM suppliers WHERE practice_id = :practiceId AND lower(name) = lower(:name) AND archived_at IS NULL
        AND (:exceptId::uuid IS NULL OR id <> :exceptId)`,
    { practiceId: ctx.practiceId, name, exceptId },
  );
  if (taken) throw conflict(`There's already a supplier called "${name}".`);
}

export async function createSupplier(ctx, input) {
  await assertSupplierName(ctx, input.name);
  return one(
    `INSERT INTO suppliers (practice_id, name, contact_person, phone, email, notes)
     VALUES (:practiceId, :name, :contact_person, :phone, :email, :notes) RETURNING *`,
    {
      practiceId: ctx.practiceId,
      contact_person: null,
      phone: null,
      email: null,
      notes: null,
      ...input,
    },
  );
}

export async function updateSupplier(ctx, id, input) {
  const current = await one(
    `SELECT * FROM suppliers WHERE id = :id AND practice_id = :practiceId`,
    { id, practiceId: ctx.practiceId },
  );
  if (!current) throw notFound("Supplier not found.");
  if (input.name || input.archived === false)
    await assertSupplierName(ctx, input.name ?? current.name, id);
  const next = { ...current, ...input };
  return one(
    `UPDATE suppliers SET name = :name, contact_person = :contact_person, phone = :phone, email = :email, notes = :notes,
            archived_at = CASE WHEN :archived::boolean IS NULL THEN archived_at WHEN :archived THEN coalesce(archived_at, now()) ELSE NULL END
      WHERE id = :id RETURNING *`,
    {
      id,
      name: next.name,
      contact_person: next.contact_person,
      phone: next.phone,
      email: next.email,
      notes: next.notes,
      archived: input.archived ?? null,
    },
  );
}

// --- items -----------------------------------------------------------------------

const ITEM_COLUMNS = `i.*, s.name AS supplier_name, (i.current_stock <= i.reorder_level) AS low_stock,
  (SELECT min(m.expiry_date) FROM stock_movements m WHERE m.item_id = i.id AND m.type = 'purchase' AND m.expiry_date >= current_date) AS next_expiry`;

export async function listItems(
  ctx,
  {
    clinic_id: clinicId,
    q,
    category,
    low_stock: lowStock,
    include_archived: includeArchived,
  },
) {
  await assertClinic(ctx, clinicId);
  return select(
    `SELECT ${ITEM_COLUMNS} FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.clinic_id = :clinicId ${includeArchived ? "" : "AND i.archived_at IS NULL"}
        AND (:q::text IS NULL OR i.name ILIKE :like OR i.sku ILIKE :like)
        AND (:category::text IS NULL OR i.category = :category)
        AND (NOT :lowStock OR i.current_stock <= i.reorder_level)
      ORDER BY i.archived_at NULLS FIRST, (i.current_stock <= i.reorder_level) DESC, lower(i.name)`,
    {
      clinicId,
      q: q ?? null,
      like: `%${q ?? ""}%`,
      category: category ?? null,
      lowStock: !!lowStock,
    },
  );
}

async function loadItem(ctx, id) {
  const item = await one(
    `SELECT ${ITEM_COLUMNS} FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.id = :id AND i.practice_id = :practiceId`,
    {
      id,
      practiceId: ctx.practiceId,
    },
  );
  if (!item) throw notFound("Item not found.");
  return item;
}

async function assertItemName(clinicId, name, exceptId = null) {
  const taken = await one(
    `SELECT 1 FROM inventory_items WHERE clinic_id = :clinicId AND lower(name) = lower(:name) AND archived_at IS NULL
        AND (:exceptId::uuid IS NULL OR id <> :exceptId)`,
    { clinicId, name, exceptId },
  );
  if (taken) throw conflict(`"${name}" is already in this clinic's stock.`);
}

export async function createItem(ctx, input) {
  await assertClinic(ctx, input.clinic_id);
  await assertSupplier(ctx, input.supplier_id);
  await assertItemName(input.clinic_id, input.name);
  const { opening_stock: openingStock = 0, ...fields } = input;
  const id = await withTransaction(async (transaction) => {
    const row = await one(
      `INSERT INTO inventory_items (practice_id, clinic_id, name, category, unit, sku, reorder_level, unit_cost, supplier_id, notes)
       VALUES (:practiceId, :clinic_id, :name, :category, :unit, :sku, :reorder_level, :unit_cost, :supplier_id, :notes) RETURNING id`,
      {
        practiceId: ctx.practiceId,
        category: "Consumables",
        unit: "pcs",
        sku: null,
        reorder_level: 0,
        unit_cost: null,
        supplier_id: null,
        notes: null,
        ...fields,
      },
      { transaction },
    );
    if (openingStock > 0) {
      await exec(
        `INSERT INTO stock_movements (practice_id, item_id, type, quantity, unit_cost, movement_date, notes, created_by)
         VALUES (:practiceId, :itemId, 'adjustment', :qty, :unitCost, :date, 'Opening stock', :userId)`,
        {
          practiceId: ctx.practiceId,
          itemId: row.id,
          qty: openingStock,
          unitCost: fields.unit_cost ?? null,
          date: await clinicToday({ transaction }),
          userId: ctx.userId,
        },
        { transaction },
      );
      await exec(
        `UPDATE inventory_items SET current_stock = :qty WHERE id = :id`,
        { id: row.id, qty: openingStock },
        { transaction },
      );
    }
    return row.id;
  });
  return loadItem(ctx, id);
}

export async function updateItem(ctx, id, input) {
  const item = await loadItem(ctx, id);
  if (input.name || input.archived === false)
    await assertItemName(item.clinic_id, input.name ?? item.name, id);
  if (input.supplier_id) await assertSupplier(ctx, input.supplier_id);
  const next = { ...item, ...input };
  await exec(
    `UPDATE inventory_items SET name = :name, category = :category, unit = :unit, sku = :sku, reorder_level = :reorder_level,
            unit_cost = :unit_cost, supplier_id = :supplier_id, notes = :notes, updated_at = now(),
            archived_at = CASE WHEN :archived::boolean IS NULL THEN archived_at WHEN :archived THEN coalesce(archived_at, now()) ELSE NULL END
      WHERE id = :id`,
    {
      id,
      name: next.name,
      category: next.category,
      unit: next.unit,
      sku: next.sku ?? null,
      reorder_level: next.reorder_level,
      unit_cost: next.unit_cost ?? null,
      supplier_id: next.supplier_id ?? null,
      notes: next.notes ?? null,
      archived: input.archived ?? null,
    },
  );
  return loadItem(ctx, id);
}

// --- movements ---------------------------------------------------------------------

const SIGN = { purchase: 1, used: -1, wasted: -1 };

export async function recordMovement(ctx, itemId, input) {
  const item = await loadItem(ctx, itemId);
  if (item.archived_at) throw badRequest("This item is archived.");
  if (input.type === "adjustment" && !input.notes?.trim())
    throw badRequest("Say why the stock is being corrected.");
  if (input.create_expense) {
    if (input.type !== "purchase")
      throw badRequest("Only purchases can be added to expenses.");
    if (!can(ctx, "accounts.manage"))
      throw forbidden("You can't record expenses.");
    if (!input.unit_cost)
      throw badRequest("Enter the cost to add the purchase to expenses.");
  }
  await assertSupplier(ctx, input.supplier_id);
  const quantity =
    input.type === "adjustment"
      ? input.quantity
      : SIGN[input.type] * Math.abs(input.quantity);
  if (item.current_stock + quantity < 0) {
    throw new AppError(
      400,
      `Only ${item.current_stock} ${item.unit} of ${item.name} in stock.`,
      { code: "STOCK_TOO_LOW" },
    );
  }
  const date = input.movement_date ?? (await clinicToday());

  let expenseId = null;
  if (input.create_expense) {
    const supplier = input.supplier_id
      ? await one(`SELECT name FROM suppliers WHERE id = :id`, {
          id: input.supplier_id,
        })
      : null;
    const expense = await recordExpense(ctx, {
      categoryName: "Dental materials",
      clinic_id: item.clinic_id,
      expense_date: date,
      amount: Math.abs(quantity) * input.unit_cost,
      payment_method: input.payment_method ?? "cash",
      vendor: supplier?.name ?? null,
      reference: input.reference ?? null,
      notes: `${Math.abs(quantity)} ${item.unit} ${item.name}`,
    });
    expenseId = expense.id;
  }

  try {
    await saveMovement();
  } catch (error) {
    // Don't leave an expense behind for a purchase that wasn't recorded.
    if (expenseId)
      await exec(`UPDATE expenses SET deleted_at = now() WHERE id = :id`, {
        id: expenseId,
      });
    throw error;
  }
  return loadItem(ctx, itemId);

  function saveMovement() {
    return withTransaction(async (transaction) => {
      // Re-check under a row lock so two people can't both take the last box.
      const locked = await one(
        `SELECT current_stock FROM inventory_items WHERE id = :id FOR UPDATE`,
        { id: itemId },
        { transaction },
      );
      if (locked.current_stock + quantity < 0) {
        throw new AppError(
          400,
          `Only ${locked.current_stock} ${item.unit} of ${item.name} in stock.`,
          { code: "STOCK_TOO_LOW" },
        );
      }
      await exec(
        `INSERT INTO stock_movements (practice_id, item_id, type, quantity, unit_cost, supplier_id, expiry_date, movement_date, reference, notes, expense_id, created_by)
       VALUES (:practiceId, :itemId, :type, :quantity, :unitCost, :supplierId, :expiry, :date, :reference, :notes, :expenseId, :userId)`,
        {
          practiceId: ctx.practiceId,
          itemId,
          type: input.type,
          quantity,
          unitCost: input.unit_cost ?? null,
          supplierId: input.supplier_id ?? null,
          expiry: input.expiry_date ?? null,
          date,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          expenseId,
          userId: ctx.userId,
        },
        { transaction },
      );
      await exec(
        `UPDATE inventory_items SET current_stock = current_stock + :quantity,
              unit_cost = CASE WHEN :type = 'purchase' AND :unitCost::int IS NOT NULL THEN :unitCost ELSE unit_cost END,
              supplier_id = CASE WHEN :type = 'purchase' AND :supplierId::uuid IS NOT NULL THEN :supplierId ELSE supplier_id END,
              updated_at = now()
        WHERE id = :itemId`,
        {
          itemId,
          quantity,
          type: input.type,
          unitCost: input.unit_cost ?? null,
          supplierId: input.supplier_id ?? null,
        },
        { transaction },
      );
    });
  }
}

export async function listMovements(ctx, itemId, { limit = 100 } = {}) {
  await loadItem(ctx, itemId);
  return select(
    `SELECT m.*, s.name AS supplier_name, u.fullname AS created_by_name
       FROM stock_movements m LEFT JOIN suppliers s ON s.id = m.supplier_id LEFT JOIN users u ON u.id = m.created_by
      WHERE m.item_id = :itemId ORDER BY m.created_at DESC LIMIT :limit`,
    { itemId, limit },
  );
}

// Stock value, low stock, items expiring in 60 days, and usage / wastage
// per item over a period.
export async function inventoryReport(ctx, { clinic_id: clinicId, from, to }) {
  await assertClinic(ctx, clinicId);
  const params = { clinicId, from, to };
  const [totals, usage, expiring] = await Promise.all([
    one(
      `SELECT count(*)::int AS items, count(*) FILTER (WHERE current_stock <= reorder_level)::int AS low_stock,
              coalesce(sum(current_stock * coalesce(unit_cost, 0)), 0)::bigint AS stock_value
         FROM inventory_items WHERE clinic_id = :clinicId AND archived_at IS NULL`,
      params,
    ),
    select(
      `SELECT i.id, i.name, i.unit,
              coalesce(sum(-m.quantity) FILTER (WHERE m.type = 'used'), 0)::int AS used,
              coalesce(sum(-m.quantity) FILTER (WHERE m.type = 'wasted'), 0)::int AS wasted,
              coalesce(sum(m.quantity) FILTER (WHERE m.type = 'purchase'), 0)::int AS purchased,
              coalesce(sum(m.quantity * coalesce(m.unit_cost, 0)) FILTER (WHERE m.type = 'purchase'), 0)::bigint AS purchase_cost,
              coalesce(sum(-m.quantity * coalesce(i.unit_cost, 0)) FILTER (WHERE m.type = 'wasted'), 0)::bigint AS wastage_value
         FROM inventory_items i JOIN stock_movements m ON m.item_id = i.id
        WHERE i.clinic_id = :clinicId AND m.movement_date BETWEEN :from::date AND :to::date
        GROUP BY i.id ORDER BY used DESC, lower(i.name)`,
      params,
    ),
    select(
      `SELECT DISTINCT ON (i.id) i.id, i.name, m.expiry_date, i.current_stock, i.unit
         FROM inventory_items i JOIN stock_movements m ON m.item_id = i.id
        WHERE i.clinic_id = :clinicId AND i.archived_at IS NULL AND i.current_stock > 0 AND m.type = 'purchase'
          AND m.expiry_date BETWEEN current_date AND current_date + 60
        ORDER BY i.id, m.expiry_date`,
      params,
    ),
  ]);
  const num = (v) => Number(v ?? 0);
  return {
    totals: { ...totals, stock_value: num(totals.stock_value) },
    usage: usage.map((u) => ({
      ...u,
      purchase_cost: num(u.purchase_cost),
      wastage_value: num(u.wastage_value),
    })),
    expiring: expiring.sort((a, b) =>
      String(a.expiry_date).localeCompare(String(b.expiry_date)),
    ),
  };
}
