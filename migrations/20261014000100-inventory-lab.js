"use strict";
// Inventory and dental lab management (Dentee-style):
// - suppliers, stock items per clinic with a reorder level, and every
//   stock movement (purchase, use, wastage, correction); current_stock is
//   kept in step with the movements;
// - dental labs and lab orders (crowns, bridges, dentures…) with status
//   history, due dates and the lab bill. Purchases and lab bills can be
//   recorded as expenses (expense_id links back).
import { seedSystemRoles } from "../app/lib/seed-system-roles.js";

const TABLES = ["lab_order_events", "lab_orders", "labs", "lab_order_counters", "stock_movements", "inventory_items", "suppliers"];
const TYPES = ["enum_stock_movement_type", "enum_lab_orders_status"];

export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const practice = `practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE`;
    const clinic = `clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE`;
    const createdBy = `created_by uuid REFERENCES public.users(id) ON DELETE SET NULL`;
    await q(`
      CREATE TYPE public.enum_stock_movement_type AS ENUM ('purchase', 'used', 'wasted', 'adjustment');
      CREATE TYPE public.enum_lab_orders_status AS ENUM ('draft', 'sent', 'received', 'fitted', 'remake', 'cancelled');

      CREATE TABLE public.suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        contact_person varchar(255),
        phone varchar(32),
        email varchar(255),
        notes text,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX suppliers_name ON public.suppliers (practice_id, lower(name)) WHERE archived_at IS NULL;

      CREATE TABLE public.inventory_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        ${clinic},
        name varchar(255) NOT NULL,
        category varchar(60) NOT NULL DEFAULT 'Consumables',
        unit varchar(30) NOT NULL DEFAULT 'pcs',
        sku varchar(80),
        reorder_level int NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
        current_stock int NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
        unit_cost int CHECK (unit_cost >= 0),
        supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
        notes text,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX inventory_items_name ON public.inventory_items (clinic_id, lower(name)) WHERE archived_at IS NULL;

      -- quantity is signed: purchases and positive corrections add stock.
      CREATE TABLE public.stock_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
        type public.enum_stock_movement_type NOT NULL,
        quantity int NOT NULL CHECK (quantity <> 0),
        unit_cost int CHECK (unit_cost >= 0),
        supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
        expiry_date date,
        movement_date date NOT NULL,
        reference varchar(120),
        notes text,
        expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
        ${createdBy},
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX stock_movements_item ON public.stock_movements (item_id, created_at DESC);
      CREATE INDEX stock_movements_practice_date ON public.stock_movements (practice_id, movement_date);

      CREATE TABLE public.labs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        name varchar(255) NOT NULL,
        contact_person varchar(255),
        phone varchar(32),
        email varchar(255),
        address text,
        notes text,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX labs_name ON public.labs (practice_id, lower(name)) WHERE archived_at IS NULL;

      CREATE TABLE public.lab_order_counters (
        practice_id uuid PRIMARY KEY REFERENCES public.practices(id) ON DELETE CASCADE,
        last_number int NOT NULL DEFAULT 0
      );

      CREATE TABLE public.lab_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ${practice},
        ${clinic},
        lab_id uuid NOT NULL REFERENCES public.labs(id) ON DELETE RESTRICT,
        patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
        treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
        number varchar(40) NOT NULL,
        work_type varchar(80) NOT NULL,
        teeth varchar(120),
        shade varchar(40),
        material varchar(120),
        instructions text,
        status public.enum_lab_orders_status NOT NULL DEFAULT 'draft',
        sent_date date,
        due_date date,
        received_date date,
        fitted_date date,
        lab_cost int CHECK (lab_cost >= 0),
        paid_at timestamptz,
        expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
        ${createdBy},
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (practice_id, number)
      );
      CREATE INDEX lab_orders_practice_status ON public.lab_orders (practice_id, status, due_date);
      CREATE INDEX lab_orders_patient ON public.lab_orders (patient_id);

      CREATE TABLE public.lab_order_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
        status public.enum_lab_orders_status NOT NULL,
        note text,
        ${createdBy},
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lab_order_events_order ON public.lab_order_events (order_id, created_at);
    `);
    await seedSystemRoles(queryInterface.sequelize, { transaction });
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM public.role_permissions WHERE permission_key IN ('inventory.view', 'inventory.manage', 'lab.view', 'lab.manage')`);
    for (const t of TABLES) await q(`DROP TABLE IF EXISTS public."${t}"`);
    for (const t of TYPES) await q(`DROP TYPE IF EXISTS public."${t}"`);
  });
}
