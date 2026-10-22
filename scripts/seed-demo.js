// Fills the local dev database with demo data for every screen of the
// dashboard and the mobile app: chairs + appointments (chair board, waiting
// times), accounts (expenses, cash book, invoices), inventory + suppliers,
// labs + lab orders, leads (pipeline, follow-ups, tags, custom fields),
// forms + submissions, lead imports, WhatsApp templates/inbox/campaigns,
// email templates/inbox/campaigns/automation, patient message rules +
// broadcasts, notifications and failed background jobs. Finally every
// active treatment gets clinical records wherever a section is blank
// (see seed-treatment-records.js, also runnable alone as seed:records).
//
//   npm run seed:demo            # refuses to run if demo data already exists
//   npm run seed:demo -- --reset # deletes the demo rows first, then reseeds
//
// It never touches patients, users, services, treatments or the legacy
// ledger: those come from the real data already in the database.
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import { resetTreatmentRecords, seedTreatmentRecords } from "./seed-treatment-records.js";

const RESET = process.argv.includes("--reset");
const uuid = () => crypto.randomUUID();
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
today.setHours(0, 0, 0, 0);
const daysAgo = (n, hour = 10, minute = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const dateAgo = (n) => ymd(daysAgo(n));
const pick = (arr, i) => arr[i % arr.length];

const client = new pg.Client({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USERNAME,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Columns that are real Postgres arrays; every other array value is JSON.
const ARRAY_COLS = new Set(["slots", "to_addresses", "cc_addresses", "bcc_addresses"]);

async function insert(table, rows, { returning = "id" } = {}) {
  if (!rows.length) return [];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const values = [];
  const tuples = rows.map((r) => {
    const placeholders = cols.map((c) => {
      const v = r[c];
      if (v === undefined) return "DEFAULT";
      const isJson = v !== null && typeof v === "object" && !(v instanceof Date) && !(Array.isArray(v) && ARRAY_COLS.has(c));
      values.push(isJson ? JSON.stringify(v) : v);
      return `$${values.length}`;
    });
    return `(${placeholders.join(",")})`;
  });
  const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")}${returning ? ` RETURNING ${returning}` : ""}`;
  const res = await client.query(sql, values);
  return res.rows;
}

const q = async (sql, params = []) => (await client.query(sql, params)).rows;

async function main() {
  await client.connect();

  const [practice] = await q(`SELECT id, name, owner_user_id FROM practices ORDER BY created_at LIMIT 1`);
  const [clinic] = await q(`SELECT id, name FROM clinics ORDER BY created_at LIMIT 1`);
  const [doctor] = await q(`SELECT d.id, d.user_id FROM doctors d WHERE d.user_id = $1`, [practice.owner_user_id]);
  const staffUsers = await q(`SELECT id, fullname FROM users WHERE role = 'staff' AND deleted_at IS NULL ORDER BY created_at`);
  const P = practice.id;
  const C = clinic.id;
  const DOC = doctor.user_id;
  const STAFF = staffUsers[0]?.id ?? DOC;
  const users = [DOC, STAFF];

  const existing = await q(`SELECT count(*)::int AS n FROM leads WHERE practice_id = $1`, [P]);
  if (existing[0].n > 0 && !RESET) {
    console.log(`Demo data already present (${existing[0].n} leads). Run with --reset to wipe and reseed.`);
    await client.end();
    return;
  }

  await client.query("BEGIN");
  if (RESET) {
    console.log("Removing earlier demo rows…");
    for (const sql of [
      `DELETE FROM pgboss.job WHERE data->>'seeded' = 'true'`,
      `DELETE FROM user_notifications WHERE practice_id = $1`,
      `DELETE FROM patient_messages WHERE practice_id = $1`,
      `DELETE FROM patient_broadcasts WHERE practice_id = $1`,
      `DELETE FROM patient_message_rules WHERE practice_id = $1`,
      `DELETE FROM email_automation_runs WHERE practice_id = $1`,
      `DELETE FROM email_automation_rules WHERE practice_id = $1`,
      `DELETE FROM email_campaign_recipients WHERE practice_id = $1`,
      `DELETE FROM email_messages WHERE practice_id = $1`,
      `DELETE FROM email_campaigns WHERE practice_id = $1`,
      `DELETE FROM email_templates WHERE practice_id = $1`,
      `DELETE FROM email_settings WHERE practice_id = $1`,
      `DELETE FROM whatsapp_campaign_recipients WHERE practice_id = $1`,
      `DELETE FROM whatsapp_campaigns WHERE practice_id = $1`,
      `DELETE FROM whatsapp_messages WHERE practice_id = $1`,
      `DELETE FROM whatsapp_conversations WHERE practice_id = $1`,
      `DELETE FROM whatsapp_templates WHERE practice_id = $1`,
      `DELETE FROM lead_import_rows WHERE practice_id = $1`,
      `DELETE FROM lead_imports WHERE practice_id = $1`,
      `DELETE FROM form_submissions WHERE practice_id = $1`,
      `DELETE FROM form_fields WHERE practice_id = $1`,
      `DELETE FROM forms WHERE practice_id = $1`,
      `DELETE FROM lead_custom_field_values WHERE lead_id IN (SELECT id FROM leads WHERE practice_id = $1)`,
      `DELETE FROM lead_tags WHERE lead_id IN (SELECT id FROM leads WHERE practice_id = $1)`,
      `DELETE FROM tags WHERE practice_id = $1`,
      `DELETE FROM lead_stage_history WHERE practice_id = $1`,
      `DELETE FROM lead_activities WHERE practice_id = $1`,
      `DELETE FROM leads WHERE practice_id = $1`,
      `DELETE FROM pipeline_members WHERE practice_id = $1`,
      `DELETE FROM lab_order_events WHERE order_id IN (SELECT id FROM lab_orders WHERE practice_id = $1)`,
      `DELETE FROM lab_orders WHERE practice_id = $1`,
      `DELETE FROM lab_order_counters WHERE practice_id = $1`,
      `DELETE FROM labs WHERE practice_id = $1`,
      `DELETE FROM stock_movements WHERE practice_id = $1`,
      `DELETE FROM inventory_items WHERE practice_id = $1`,
      `DELETE FROM suppliers WHERE practice_id = $1`,
      `DELETE FROM invoices WHERE practice_id = $1`,
      `DELETE FROM invoice_counters WHERE practice_id = $1`,
      `DELETE FROM cash_entries WHERE practice_id = $1`,
      `DELETE FROM expenses WHERE practice_id = $1`,
      `DELETE FROM bookings WHERE practice_id = $1 AND chair_id IS NOT NULL AND date BETWEEN CURRENT_DATE - 10 AND CURRENT_DATE + 10`,
      `DELETE FROM chairs WHERE practice_id = $1 AND name LIKE 'Chair %'`,
      `DELETE FROM blocked_slots WHERE practice_id = $1 AND date > CURRENT_DATE`,
    ]) {
      await client.query(sql, [P]);
    }
    await resetTreatmentRecords(client);
  }

  // ---- reference data -------------------------------------------------
  const patients = await q(
    `SELECT p.id, u.fullname, u.email, u.mobile_number AS phone, u.dob
       FROM patients p JOIN users u ON u.id = p.user_id
      WHERE u.deleted_at IS NULL AND u.fullname <> '' ORDER BY p.created_at DESC LIMIT 40`,
  );
  const treatments = await q(
    `SELECT t.id, t.patient_id, s.name AS service_name FROM treatments t JOIN services s ON s.id = t.service_id
      WHERE t.practice_id = $1 ORDER BY t.created_at DESC LIMIT 20`,
    [P],
  );
  const services = await q(`SELECT id, name FROM services ORDER BY name LIMIT 30`);
  const categories = Object.fromEntries((await q(`SELECT id, name FROM expense_categories WHERE practice_id = $1`, [P])).map((c) => [c.name, c.id]));
  const [pipeline] = await q(`SELECT id FROM pipelines WHERE practice_id = $1 ORDER BY is_default DESC LIMIT 1`, [P]);
  const stages = await q(`SELECT id, name, stage_type FROM pipeline_stages WHERE pipeline_id = $1 AND archived_at IS NULL ORDER BY position`, [pipeline.id]);
  const openStages = stages.filter((s) => s.stage_type === "open");
  const wonStage = stages.find((s) => s.stage_type === "won");
  const lostStage = stages.find((s) => s.stage_type === "lost");
  const customFields = await q(`SELECT id, key, field_type, options FROM custom_fields WHERE practice_id = $1 AND archived_at IS NULL`, [P]);

  // ---- chairs + appointments -------------------------------------------
  console.log("Chairs & appointments");
  let chairs = await q(`SELECT id, name FROM chairs WHERE practice_id = $1 AND archived_at IS NULL ORDER BY position`, [P]);
  const wanted = [
    ["Chair 1", "#0ea5e9"],
    ["Chair 2", "#16a34a"],
    ["Chair 3", "#f59e0b"],
    ["Chair 4", "#a855f7"],
  ];
  const extra = wanted.slice(chairs.length).map(([name, color], i) => ({ practice_id: P, clinic_id: C, name, color, position: chairs.length + i }));
  const newChairs = await insert("chairs", extra, { returning: "id, name" });
  chairs = [...chairs, ...newChairs];

  const slots = ["10:30:00", "11:00:00", "11:30:00", "12:00:00", "12:30:00", "14:00:00", "14:30:00", "15:00:00", "15:30:00", "16:00:00", "16:30:00", "17:00:00", "17:30:00", "18:00:00"];
  const bookings = [];
  let pi = 0;
  for (let offset = -3; offset <= 3; offset++) {
    const day = daysAgo(-offset);
    if (day.getDay() === 0) continue; // Sunday is the day off
    const count = offset === 0 ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const slot = pick(slots, i + offset + 3);
      const [h, m] = slot.split(":").map(Number);
      const start = new Date(day);
      start.setHours(h, m, 0, 0);
      const patient = pick(patients, pi++);
      const past = offset < 0 || (offset === 0 && i < 5);
      const row = {
        id: uuid(),
        doctor_id: doctor.id,
        patient_id: patient.id,
        clinic_id: C,
        practice_id: P,
        date: ymd(day),
        slot,
        status: offset < 0 ? (i % 5 === 4 ? "canceled" : "completed") : offset === 0 && i < 3 ? "completed" : "pending",
        chair_id: pick(chairs, i).id,
        created_at: daysAgo(-offset + 2),
        updated_at: daysAgo(-offset + 2),
      };
      if (past && row.status !== "canceled") {
        const wait = 5 + ((i * 7) % 25);
        row.checked_in_at = new Date(start.getTime() - 10 * 60000);
        row.seated_at = new Date(start.getTime() + (wait - 10) * 60000);
        if (row.status === "completed") row.finished_at = new Date(row.seated_at.getTime() + (20 + (i % 3) * 10) * 60000);
      } else if (offset === 0 && i === 5) {
        row.checked_in_at = new Date(Date.now() - 12 * 60000); // waiting right now
      }
      bookings.push(row);
    }
  }
  await insert("bookings", bookings);

  const nextWeek = daysAgo(-8);
  await insert("blocked_slots", [
    { id: uuid(), clinic_id: C, practice_id: P, type: "date", date: ymd(nextWeek), slots: ["10:30:00", "11:00:00"], created_at: new Date(), updated_at: new Date() },
    { id: uuid(), clinic_id: C, practice_id: P, type: "slot", date: ymd(daysAgo(-2)), slots: ["13:00:00", "13:30:00"], created_at: new Date(), updated_at: new Date() },
  ]);

  // ---- accounts: expenses, cash book, invoices -------------------------
  console.log("Accounts");
  const expenseRows = [
    ["Dental materials", 18500, "upi", "Dentsply India", "INV-DS-4471", "Composite kits and bonding agent"],
    ["Lab charges", 6200, "bank_transfer", "Smile Dental Lab", "SDL-2291", "Zirconia crown x2"],
    ["Salaries", 45000, "bank_transfer", "Staff payroll", "SEP-2026", "Monthly salaries"],
    ["Rent", 35000, "cheque", "Mr. R. Agarwal", "CHQ 001233", "Clinic rent"],
    ["Electricity & utilities", 4350, "upi", "BSES Rajdhani", "BILL-88213", ""],
    ["Equipment & maintenance", 2800, "cash", "Hi-Tech Dental Services", "", "Autoclave servicing"],
    ["Marketing", 7500, "card", "Meta Ads", "FB-55210", "October lead campaign"],
    ["Miscellaneous", 950, "cash", "Local store", "", "Tea, water and stationery"],
    ["Dental materials", 9200, "upi", "3M India", "3M-10012", "Impression material"],
    ["Lab charges", 4100, "upi", "Precision Dental Lab", "PDL-0713", "Denture repair"],
    ["Electricity & utilities", 1200, "upi", "Airtel", "", "Internet and phone"],
    ["Equipment & maintenance", 15800, "bank_transfer", "Confident Dental Equipments", "CDE-5531", "Compressor repair"],
    ["Marketing", 3000, "upi", "Google Ads", "GA-9021", ""],
    ["Dental materials", 5600, "cash", "Dentsply India", "INV-DS-4512", "Gloves, masks, bibs"],
    ["Salaries", 45000, "bank_transfer", "Staff payroll", "AUG-2026", "Monthly salaries"],
    ["Rent", 35000, "cheque", "Mr. R. Agarwal", "CHQ 001218", "Clinic rent"],
  ];
  const expenses = await insert(
    "expenses",
    expenseRows.map(([cat, amount, method, vendor, reference, notes], i) => ({
      practice_id: P,
      clinic_id: C,
      category_id: categories[cat],
      expense_date: dateAgo(i * 4 + 1),
      amount,
      payment_method: method,
      vendor,
      reference: reference || null,
      notes: notes || null,
      created_by: pick(users, i),
    })),
  );

  await insert("cash_entries", [
    { practice_id: P, clinic_id: C, entry_date: dateAgo(60), type: "opening_balance", amount: 25000, notes: "Opening cash balance", created_by: DOC },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(30), type: "cash_in", amount: 12000, reference: "Counter collections", notes: "Week 1 cash collections", created_by: STAFF },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(26), type: "bank_deposit", amount: 20000, bank_name: "HDFC Bank", reference: "DEP-77120", created_by: DOC },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(18), type: "cash_out", amount: 3500, notes: "Petty cash to staff", created_by: DOC },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(12), type: "cash_in", amount: 15500, reference: "Counter collections", created_by: STAFF },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(7), type: "bank_deposit", amount: 15000, bank_name: "HDFC Bank", reference: "DEP-77412", created_by: DOC },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(2), type: "cash_in", amount: 8200, reference: "Counter collections", created_by: STAFF },
    { practice_id: P, clinic_id: C, entry_date: dateAgo(1), type: "cash_out", amount: 1200, notes: "Courier and printing", created_by: STAFF },
  ]);

  const invoiceSpecs = [
    [[["Root canal treatment - 36", 1, 8500], ["Composite filling", 1, 2500]], 500, 0],
    [[["Scaling & polishing", 1, 1500]], 0, 0],
    [[["Zirconia crown - 16", 1, 12000]], 1000, 5],
    [[["Consultation", 1, 500], ["IOPA X-ray", 2, 200]], 0, 0],
    [[["Tooth extraction - 48", 1, 3000]], 0, 0],
    [[["Teeth whitening", 1, 9000]], 1500, 18],
    [[["Clear aligners - phase 1", 1, 45000]], 5000, 0],
    [[["Denture repair", 1, 2200]], 0, 0],
  ];
  const yearPrefix = `INV-${today.getFullYear()}-`;
  const invoices = invoiceSpecs.map(([lines, discount, tax], i) => {
    const items = lines.map(([description, quantity, unit_price]) => ({ description, quantity, unit_price }));
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const taxAmount = Math.round(((subtotal - discount) * tax) / 100);
    const t = treatments.find((x) => x.patient_id === pick(patients, i + 3).id);
    return {
      practice_id: P,
      clinic_id: C,
      patient_id: pick(patients, i + 3).id,
      treatment_id: t?.id ?? null,
      number: `${yearPrefix}${String(i + 1).padStart(4, "0")}`,
      issue_date: dateAgo(20 - i * 2),
      due_date: dateAgo(13 - i * 2),
      items,
      subtotal,
      discount,
      tax_percent: tax,
      tax_amount: taxAmount,
      total: subtotal - discount + taxAmount,
      notes: i === 2 ? "Includes lab charges" : null,
      status: i === 4 ? "cancelled" : "issued",
      cancelled_reason: i === 4 ? "Raised on the wrong patient" : null,
      created_by: pick(users, i),
    };
  });
  await insert("invoices", invoices);
  await client.query(`INSERT INTO invoice_counters (practice_id, last_number) VALUES ($1, $2) ON CONFLICT (practice_id) DO UPDATE SET last_number = EXCLUDED.last_number`, [P, invoices.length]);

  // ---- inventory ---------------------------------------------------------
  console.log("Inventory");
  const suppliers = await insert("suppliers", [
    { practice_id: P, name: "Dentsply India", contact_person: "Rahul Mehta", phone: "9811022334", email: "orders@dentsply.example.com", notes: "Net 30 terms" },
    { practice_id: P, name: "3M India", contact_person: "Anita Rao", phone: "9822011223", email: "dental@3m.example.com" },
    { practice_id: P, name: "Confident Dental Equipments", contact_person: "Suresh Pillai", phone: "9900112233", email: "sales@confident.example.com", notes: "Equipment and spares" },
  ]);
  const itemSpecs = [
    ["Composite resin A2", "Consumables", "syringe", "CR-A2", 5, 3, 850, 0],
    ["Composite resin A3", "Consumables", "syringe", "CR-A3", 5, 12, 850, 0],
    ["Bonding agent", "Consumables", "bottle", "BA-01", 2, 4, 1900, 0],
    ["Nitrile gloves (M)", "Disposables", "box", "GL-M", 10, 6, 450, 0],
    ["Nitrile gloves (L)", "Disposables", "box", "GL-L", 10, 22, 450, 0],
    ["Surgical masks", "Disposables", "box", "MK-50", 5, 14, 180, 0],
    ["Patient bibs", "Disposables", "pack", "BIB-100", 3, 2, 320, 0],
    ["Alginate impression material", "Consumables", "pack", "ALG-450", 3, 7, 620, 1],
    ["Gutta percha points", "Endodontics", "box", "GP-15", 4, 9, 350, 1],
    ["Endo files 21mm", "Endodontics", "pack", "EF-21", 4, 1, 540, 1],
    ["Local anaesthetic cartridges", "Pharmacy", "box", "LA-50", 5, 8, 1250, 1],
    ["Prophy paste", "Consumables", "jar", "PP-01", 2, 5, 390, 1],
    ["Suction tips", "Disposables", "pack", "ST-100", 3, 11, 210, 0],
    ["Autoclave pouches", "Sterilisation", "box", "AP-200", 2, 0, 480, 2],
  ];
  const items = await insert(
    "inventory_items",
    itemSpecs.map(([name, category, unit, sku, reorder_level, current_stock, unit_cost, s]) => ({
      practice_id: P,
      clinic_id: C,
      name,
      category,
      unit,
      sku,
      reorder_level,
      current_stock,
      unit_cost,
      supplier_id: suppliers[s].id,
    })),
    { returning: "id, current_stock, unit_cost, supplier_id" },
  );
  const movements = [];
  items.forEach((it, i) => {
    const purchased = it.current_stock + 4 + (i % 3);
    movements.push({ practice_id: P, item_id: it.id, type: "purchase", quantity: purchased, unit_cost: it.unit_cost, supplier_id: it.supplier_id, movement_date: dateAgo(30 - i), reference: `PO-${1040 + i}`, expiry_date: i % 4 === 0 ? dateAgo(-400) : null, expense_id: i === 0 ? expenses[0].id : null, created_by: STAFF });
    movements.push({ practice_id: P, item_id: it.id, type: "used", quantity: -(3 + (i % 3)), movement_date: dateAgo(10 - (i % 5)), notes: "Used in treatment", created_by: pick(users, i) });
    if (i % 5 === 1) movements.push({ practice_id: P, item_id: it.id, type: "wasted", quantity: -1, movement_date: dateAgo(4), notes: "Expired / damaged", created_by: STAFF });
  });
  await insert("stock_movements", movements);

  // ---- labs --------------------------------------------------------------
  console.log("Lab work");
  const labs = await insert("labs", [
    { practice_id: P, name: "Smile Dental Lab", contact_person: "Imran Khan", phone: "9810012345", email: "smile.lab@example.com", address: "Karol Bagh, New Delhi", notes: "Crowns, bridges, zirconia" },
    { practice_id: P, name: "Precision Dental Lab", contact_person: "Meena Iyer", phone: "9820098765", email: "precision.lab@example.com", address: "Andheri East, Mumbai", notes: "Dentures and aligners" },
  ]);
  const orderSpecs = [
    ["Zirconia crown", "16", "A2", "Zirconia", "sent", 20, 10, null, null, 4500],
    ["PFM crown", "36", "A3", "PFM", "received", 25, 15, 14, null, 3200],
    ["Complete denture (upper)", "11-17, 21-27", "A3.5", "Acrylic", "fitted", 35, 20, 18, 12, 6500],
    ["Night guard", "Upper arch", null, "Hard acrylic", "draft", null, null, null, null, 1800],
    ["Bridge 3-unit", "24-26", "A2", "Zirconia", "remake", 18, 8, 6, null, 9800],
    ["Clear aligners set", "Full arch", null, "PET-G", "sent", 6, -4, null, null, 22000],
    ["Implant crown", "46", "A3", "Zirconia", "cancelled", 30, 22, null, null, null],
  ];
  const labOrders = orderSpecs.map(([work_type, teeth, shade, material, status, sent, due, received, fitted, lab_cost], i) => ({
    practice_id: P,
    clinic_id: C,
    lab_id: labs[i % 2].id,
    patient_id: pick(patients, i + 8).id,
    treatment_id: treatments.find((t) => t.patient_id === pick(patients, i + 8).id)?.id ?? null,
    number: `LAB-${String(i + 1).padStart(4, "0")}`,
    work_type,
    teeth,
    shade,
    material,
    instructions: i === 0 ? "Match adjacent teeth; patient prefers slightly lighter shade." : i === 4 ? "Previous bridge had an open margin on 26 - please remake." : null,
    status,
    sent_date: sent == null ? null : dateAgo(sent),
    due_date: due == null ? null : dateAgo(due),
    received_date: received == null ? null : dateAgo(received),
    fitted_date: fitted == null ? null : dateAgo(fitted),
    lab_cost,
    paid_at: status === "fitted" ? daysAgo(11) : null,
    expense_id: status === "fitted" ? expenses[1].id : null,
    created_by: pick(users, i),
  }));
  const orderIds = await insert("lab_orders", labOrders);
  const events = [];
  orderIds.forEach((o, i) => {
    const flow = { draft: ["draft"], sent: ["draft", "sent"], received: ["draft", "sent", "received"], fitted: ["draft", "sent", "received", "fitted"], remake: ["draft", "sent", "received", "remake"], cancelled: ["draft", "sent", "cancelled"] }[labOrders[i].status];
    flow.forEach((status, j) => events.push({ order_id: o.id, status, note: status === "remake" ? "Open margin on 26" : status === "cancelled" ? "Patient postponed the implant" : null, created_by: pick(users, j), created_at: daysAgo(30 - j * 5) }));
  });
  await insert("lab_order_events", events);
  await client.query(`INSERT INTO lab_order_counters (practice_id, last_number) VALUES ($1, $2) ON CONFLICT (practice_id) DO UPDATE SET last_number = EXCLUDED.last_number`, [P, labOrders.length]);

  // ---- leads -------------------------------------------------------------
  console.log("Leads");
  await insert("pipeline_members", users.map((user_id) => ({ practice_id: P, pipeline_id: pipeline.id, user_id })));
  const tags = await insert("tags", [
    { practice_id: P, name: "Hot", color: "#dc2626", created_by: DOC },
    { practice_id: P, name: "Insurance", color: "#2563eb", created_by: DOC },
    { practice_id: P, name: "Referral", color: "#16a34a", created_by: DOC },
    { practice_id: P, name: "Price sensitive", color: "#f59e0b", created_by: DOC },
  ]);
  const leadSpecs = [
    ["Aarav Sharma", "9876501001", "aarav.sharma@example.com", "website", 0, "open", "Wants implants for two missing molars."],
    ["Priya Nair", "9876501002", "priya.nair@example.com", "google_ads", 1, "open", "Asked about aligner pricing."],
    ["Rohan Verma", "9876501003", "rohan.verma@example.com", "facebook", 2, "open", "Consultation booked for Saturday."],
    ["Sneha Kulkarni", "9876501004", "sneha.k@example.com", "referral", 3, "open", "Plan shared: RCT + crown on 36."],
    ["Vikram Singh", "9876501005", "vikram.singh@example.com", "walk_in", 4, "won", "Started scaling and whitening."],
    ["Ananya Reddy", "9876501006", "ananya.reddy@example.com", "instagram", 5, "lost", "Chose a clinic nearer home."],
    ["Kabir Malhotra", "9876501007", "kabir.m@example.com", "website", 0, "open", "Kid's dentistry enquiry (age 6)."],
    ["Meera Joshi", "9876501008", "meera.joshi@example.com", "whatsapp", 1, "open", "Sensitivity in upper left."],
    ["Arjun Desai", "9876501009", "arjun.desai@example.com", "google_ads", 1, "open", "Wisdom tooth pain."],
    ["Ishita Bansal", "9876501010", "ishita.b@example.com", "facebook", 2, "open", "Bridal smile makeover."],
    ["Dev Patel", "9876501011", "dev.patel@example.com", "referral", 3, "open", "Needs dentures for father."],
    ["Nisha Agarwal", "9876501012", "nisha.a@example.com", "website", 0, "open", "Cleaning and polishing."],
    ["Sameer Khan", "9876501013", "sameer.khan@example.com", "walk_in", 4, "won", "Braces started."],
    ["Pooja Mishra", "9876501014", "pooja.m@example.com", "instagram", 2, "open", "Whitening before wedding."],
    ["Harsh Gupta", "9876501015", "harsh.gupta@example.com", "google_ads", 5, "lost", "No response after 3 calls."],
    ["Tanvi Rao", "9876501016", "tanvi.rao@example.com", "website", 0, "open", "Form submission - root canal."],
  ];
  const leadRows = leadSpecs.map(([full_name, phone, email, source, stageIdx, status, notes], i) => {
    const stage = stages[stageIdx];
    const created = daysAgo(28 - i, 9 + (i % 8), (i * 11) % 60);
    const followUp = i % 4 === 0 ? daysAgo(1, 11) : i % 4 === 1 ? daysAgo(0, 16) : i % 4 === 2 ? daysAgo(-2, 10) : null;
    return {
      practice_id: P,
      clinic_id: C,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      owner_id: pick(users, i),
      full_name,
      phone,
      phone_normalized: `+91${phone}`,
      email,
      email_normalized: email.toLowerCase(),
      source,
      sub_source: source === "google_ads" ? "Search - implants" : source === "facebook" ? "Lead form Oct" : null,
      status,
      lost_reason: status === "lost" ? (i % 2 ? "Went elsewhere" : "Not reachable") : null,
      notes,
      next_follow_up_at: status === "open" ? followUp : null,
      last_activity_at: daysAgo(i % 5, 15),
      created_by: DOC,
      updated_by: pick(users, i),
      created_at: created,
      updated_at: created,
    };
  });
  const leads = await insert("leads", leadRows);
  const L = leads.map((l, i) => ({ ...leadRows[i], id: l.id }));

  const activities = [];
  const history = [];
  L.forEach((lead, i) => {
    activities.push({ practice_id: P, lead_id: lead.id, type: "created", body: `Lead created from ${lead.source.replace("_", " ")}`, created_by: DOC, created_at: lead.created_at, updated_at: lead.created_at });
    activities.push({ practice_id: P, lead_id: lead.id, type: "note", body: lead.notes, created_by: lead.owner_id, created_at: daysAgo(26 - i, 11), updated_at: daysAgo(26 - i, 11) });
    if (i % 3 === 0) activities.push({ practice_id: P, lead_id: lead.id, type: "call", body: "Called - interested, wants a quote first.", metadata: { outcome: "answered", duration_sec: 240 }, created_by: lead.owner_id, created_at: daysAgo(20 - i, 12), updated_at: daysAgo(20 - i, 12) });
    if (i % 3 === 1) activities.push({ practice_id: P, lead_id: lead.id, type: "whatsapp", body: "Sent pricing brochure on WhatsApp.", created_by: lead.owner_id, created_at: daysAgo(18 - i, 13), updated_at: daysAgo(18 - i, 13) });
    if (i % 3 === 2) activities.push({ practice_id: P, lead_id: lead.id, type: "email", body: "Emailed treatment overview.", created_by: lead.owner_id, created_at: daysAgo(17 - i, 10), updated_at: daysAgo(17 - i, 10) });
    if (lead.next_follow_up_at) activities.push({ practice_id: P, lead_id: lead.id, type: "follow_up", body: i % 2 ? "Call back about the quote" : "Confirm consultation slot", due_at: lead.next_follow_up_at, created_by: lead.owner_id, created_at: daysAgo(5, 10), updated_at: daysAgo(5, 10) });
    if (i % 5 === 2) activities.push({ practice_id: P, lead_id: lead.id, type: "follow_up", body: "Share before/after photos", due_at: daysAgo(6, 11), completed_at: daysAgo(6, 15), created_by: lead.owner_id, created_at: daysAgo(9, 10), updated_at: daysAgo(6, 15) });
    if (i % 4 === 1) activities.push({ practice_id: P, lead_id: lead.id, type: "meeting", body: "In-clinic consultation", metadata: { location: "Clinic" }, created_by: DOC, created_at: daysAgo(8, 17), updated_at: daysAgo(8, 17) });

    // stage history walking from stage 0 to the current one
    const targetIdx = stages.findIndex((s) => s.id === lead.stage_id);
    let prev = null;
    for (let s = 0; s <= targetIdx; s++) {
      if (lostStage && stages[s].id === lostStage.id && lead.status !== "lost") continue;
      if (wonStage && stages[s].id === wonStage.id && lead.status !== "won") continue;
      history.push({ practice_id: P, lead_id: lead.id, from_stage_id: prev, to_stage_id: stages[s].id, changed_by: lead.owner_id, changed_at: daysAgo(27 - i - s * 3, 12), seconds_in_previous_stage: prev ? 3 * 86400 : null });
      if (prev) activities.push({ practice_id: P, lead_id: lead.id, type: "stage_change", body: `Moved to ${stages[s].name}`, metadata: { from_stage_id: prev, to_stage_id: stages[s].id }, created_by: lead.owner_id, created_at: daysAgo(27 - i - s * 3, 12), updated_at: daysAgo(27 - i - s * 3, 12) });
      prev = stages[s].id;
    }
  });
  await insert("lead_activities", activities);
  await insert("lead_stage_history", history);
  await insert("lead_tags", L.flatMap((lead, i) => [{ lead_id: lead.id, tag_id: tags[i % tags.length].id }, ...(i % 3 === 0 ? [{ lead_id: lead.id, tag_id: tags[(i + 1) % tags.length].id }] : [])]), { returning: null });

  const cfValues = [];
  L.forEach((lead, i) => {
    for (const cf of customFields) {
      if (cf.field_type === "multi_select") cfValues.push({ lead_id: lead.id, custom_field_id: cf.id, value_json: [pick(cf.options, i), ...(i % 2 ? [pick(cf.options, i + 3)] : [])] });
      else if (cf.field_type === "dropdown") cfValues.push({ lead_id: lead.id, custom_field_id: cf.id, value_text: pick(cf.options, i) });
      else if (cf.field_type === "number") cfValues.push({ lead_id: lead.id, custom_field_id: cf.id, value_number: 1000 * (i + 1) });
      else if (cf.field_type === "date") cfValues.push({ lead_id: lead.id, custom_field_id: cf.id, value_date: dateAgo(-i) });
      else if (cf.field_type === "checkbox") cfValues.push({ lead_id: lead.id, custom_field_id: cf.id, value_bool: i % 2 === 0 });
      else cfValues.push({ lead_id: lead.id, custom_field_id: cf.id, value_text: `Sample ${cf.key} ${i + 1}` });
    }
  });
  await insert("lead_custom_field_values", cfValues);

  // ---- forms -------------------------------------------------------------
  console.log("Forms");
  const [form] = await insert("forms", [
    { practice_id: P, clinic_id: C, name: "Website enquiry form", slug: "website-enquiry", pipeline_id: pipeline.id, stage_id: stages[0].id, is_active: true, settings: { title: "Book a consultation", submit_label: "Request a call back", success_message: "Thanks! Our team will call you shortly.", theme_color: "#0f766e" }, assignment: "round_robin", created_by: DOC },
    { practice_id: P, clinic_id: C, name: "Instagram bio link", slug: "insta-smile", pipeline_id: pipeline.id, stage_id: stages[0].id, is_active: false, settings: { title: "Get your smile assessment", submit_label: "Send" }, assignment: "fixed", fixed_owner_id: DOC, created_by: DOC },
  ]);
  const [form2] = await q(`SELECT id FROM forms WHERE practice_id = $1 AND slug = 'insta-smile'`, [P]);
  const coreFields = (formId) => [
    { practice_id: P, form_id: formId, source: "core", core_key: "full_name", placeholder: "Your name", is_required: true, position: 0, width: "full" },
    { practice_id: P, form_id: formId, source: "core", core_key: "phone", placeholder: "10-digit mobile", is_required: true, position: 1, width: "half" },
    { practice_id: P, form_id: formId, source: "core", core_key: "email", placeholder: "you@example.com", is_required: false, position: 2, width: "half" },
    ...customFields.map((cf, i) => ({ practice_id: P, form_id: formId, source: "custom", custom_field_id: cf.id, is_required: false, position: 3 + i, width: "full" })),
    { practice_id: P, form_id: formId, source: "core", core_key: "notes", label_override: "Tell us about your concern", is_required: false, position: 3 + customFields.length, width: "full" },
  ];
  await insert("form_fields", [...coreFields(form.id), ...coreFields(form2.id)]);
  const submissions = [];
  for (let i = 0; i < 6; i++) {
    const lead = L[(i * 3) % L.length];
    submissions.push({
      practice_id: P,
      form_id: form.id,
      lead_id: i === 5 ? null : lead.id,
      payload: { full_name: lead.full_name, phone: lead.phone, email: lead.email, notes: lead.notes },
      ip_hash: crypto.createHash("sha256").update(`ip-${i}`).digest("hex"),
      user_agent: "Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile",
      status: i === 4 ? "duplicate" : i === 5 ? "spam" : "accepted",
      error: i === 5 ? "Turnstile check failed" : null,
      created_at: daysAgo(12 - i * 2, 9 + i),
    });
  }
  await insert("form_submissions", submissions);
  await insert("lead_activities", submissions.filter((s) => s.lead_id).map((s) => ({ practice_id: P, lead_id: s.lead_id, type: "form_submission", body: "Submitted the website enquiry form", metadata: { form_id: form.id }, created_at: s.created_at, updated_at: s.created_at })));

  // ---- lead imports ------------------------------------------------------
  console.log("Lead imports");
  const headers = ["Name", "Mobile", "Email", "Interested in"];
  const importRowsData = [
    ["Rakesh Yadav", "9876502001", "rakesh.y@example.com", "Implants"],
    ["Sunita Devi", "9876502002", "sunita.d@example.com", "Dentures"],
    ["Aarav Sharma", "9876501001", "aarav.sharma@example.com", "Implants"],
    ["Mohit Jain", "", "mohit.jain@example.com", "Whitening"],
    ["Farah Ali", "9876502005", "farah.ali@example.com", "Braces / Aligners"],
    ["Gaurav Sethi", "9876502006", "not-an-email", "Root Canal"],
  ];
  const importRows = await insert("lead_imports", [
    { practice_id: P, clinic_id: C, source_type: "file", source_name: "september-expo-leads.xlsx", status: "completed", headers, mapping: { full_name: "Name", phone: "Mobile", email: "Email", interest: "Interested in" }, pipeline_id: pipeline.id, stage_id: stages[0].id, dedupe_policy: "skip", assignment: "round_robin", lead_source: "Expo", total_rows: importRowsData.length, processed_rows: importRowsData.length, started_at: daysAgo(6, 10), finished_at: daysAgo(6, 10, 2), created_by: DOC, created_at: daysAgo(6, 9), updated_at: daysAgo(6, 10, 2) },
    { practice_id: P, clinic_id: C, source_type: "google_sheet", source_name: "Clinic walk-ins (Google Sheet)", status: "draft", headers, mapping: {}, pipeline_id: pipeline.id, stage_id: stages[0].id, lead_source: "Walk-in sheet", total_rows: 12, created_by: DOC, created_at: daysAgo(1, 18), updated_at: daysAgo(1, 18) },
    { practice_id: P, clinic_id: C, source_type: "file", source_name: "old-crm-export.csv", status: "failed", headers: ["name", "phone"], mapping: { full_name: "name", phone: "phone" }, pipeline_id: pipeline.id, stage_id: stages[0].id, lead_source: "Old CRM", total_rows: 40, processed_rows: 3, error_message: "Row 4: phone column is empty for 37 rows", started_at: daysAgo(3, 14), finished_at: daysAgo(3, 14, 1), created_by: STAFF, created_at: daysAgo(3, 13), updated_at: daysAgo(3, 14, 1) },
  ]);
  const importedLeads = await insert(
    "leads",
    [0, 1, 4].map((i) => ({
      practice_id: P,
      clinic_id: C,
      pipeline_id: pipeline.id,
      stage_id: stages[0].id,
      owner_id: pick(users, i),
      full_name: importRowsData[i][0],
      phone: importRowsData[i][1],
      phone_normalized: `+91${importRowsData[i][1]}`,
      email: importRowsData[i][2],
      email_normalized: importRowsData[i][2],
      source: "Expo",
      status: "open",
      created_by: DOC,
      created_at: daysAgo(6, 10, 1),
      updated_at: daysAgo(6, 10, 1),
    })),
  );
  const rowStatus = ["created", "created", "skipped", "error", "created", "error"];
  const rowMsg = [null, null, "Duplicate of an existing lead (phone)", "Phone is required", null, "Invalid email address"];
  const createdIdx = { 0: 0, 1: 1, 4: 2 };
  await insert(
    "lead_import_rows",
    importRowsData.map((data, i) => ({
      import_id: importRows[0].id,
      practice_id: P,
      row_number: i + 2,
      data: Object.fromEntries(headers.map((h, j) => [h, data[j]])),
      status: rowStatus[i],
      lead_id: createdIdx[i] !== undefined ? importedLeads[createdIdx[i]].id : null,
      message: rowMsg[i],
    })),
  );

  // ---- WhatsApp ----------------------------------------------------------
  console.log("WhatsApp");
  const waTemplates = await insert("whatsapp_templates", [
    { practice_id: P, meta_template_id: "1001", name: "appointment_reminder", category: "UTILITY", language: "en_US", status: "APPROVED", components: [{ type: "BODY", text: "Hi {{1}}, this is a reminder of your appointment at {{2}} on {{3}}. Reply YES to confirm." }, { type: "FOOTER", text: "Dr. Dipti Dental Clinic" }], created_by: DOC },
    { practice_id: P, meta_template_id: "1002", name: "recall_checkup", category: "MARKETING", language: "en_US", status: "APPROVED", components: [{ type: "HEADER", format: "TEXT", text: "Time for a check-up" }, { type: "BODY", text: "Hi {{1}}, it has been a while since your last visit to {{2}}. Book your check-up today and keep your smile healthy!" }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Book now" }] }], created_by: DOC },
    { practice_id: P, meta_template_id: "1003", name: "birthday_wish", category: "MARKETING", language: "en_US", status: "APPROVED", components: [{ type: "BODY", text: "Happy birthday {{1}}! Everyone at {{2}} wishes you a year full of smiles. Enjoy 10% off any cosmetic treatment this month." }], created_by: DOC },
    { practice_id: P, meta_template_id: "1004", name: "festive_offer", category: "MARKETING", language: "en_US", status: "PENDING", components: [{ type: "BODY", text: "Hi {{1}}, celebrate the festive season with a brighter smile. Teeth whitening at 20% off till the end of the month." }], created_by: DOC },
    { practice_id: P, meta_template_id: "1005", name: "payment_due", category: "UTILITY", language: "en_US", status: "REJECTED", rejection_reason: "Template contains content that does not match the UTILITY category.", components: [{ type: "BODY", text: "Hi {{1}}, a payment of {{2}} is pending for your treatment. Please pay at your next visit." }], created_by: DOC },
  ]);
  const convSpecs = [
    [0, 3, "Hi, I wanted to know the cost of implants.", 1, 25],
    [1, 2, "Can I come on Saturday afternoon?", 2, 90],
    [3, 0, "Thanks doctor, the pain is much better now.", 0, 300],
    [7, 1, "Is scaling painful?", 1, 40],
    [9, 4, "Please share the clinic address.", 0, 1500],
    [12, 0, "Sent the payment via UPI.", 1, 2800],
  ];
  const conversations = [];
  const waMessages = [];
  for (const [leadIdx, unread, lastIn, , minutesAgo] of convSpecs) {
    const lead = L[leadIdx];
    const last = new Date(Date.now() - minutesAgo * 60000);
    const id = uuid();
    conversations.push({ id, practice_id: P, lead_id: lead.id, phone: `91${lead.phone}`, contact_name: lead.full_name, last_customer_message_at: last, last_message_at: last, last_message_preview: lastIn, unread_count: unread, created_at: new Date(last.getTime() - 3 * 86400000), updated_at: last });
    const t0 = last.getTime() - 3 * 86400000;
    waMessages.push(
      { practice_id: P, conversation_id: id, wamid: `wamid.${uuid()}`, direction: "out", type: "template", body: `Hi ${lead.full_name}, this is a reminder of your appointment at Dr. Dipti Dental Clinic on ${dateAgo(2)}. Reply YES to confirm.`, status: "read", template_name: "appointment_reminder", sent_by: DOC, created_at: new Date(t0), updated_at: new Date(t0) },
      { practice_id: P, conversation_id: id, wamid: `wamid.${uuid()}`, direction: "in", type: "text", body: "YES", status: "delivered", created_at: new Date(t0 + 3600000), updated_at: new Date(t0 + 3600000) },
      { practice_id: P, conversation_id: id, wamid: `wamid.${uuid()}`, direction: "out", type: "text", body: "Great, see you then! Let us know if you need anything before the visit.", status: "delivered", sent_by: STAFF, created_at: new Date(t0 + 4000000), updated_at: new Date(t0 + 4000000) },
      { practice_id: P, conversation_id: id, wamid: `wamid.${uuid()}`, direction: "in", type: "text", body: lastIn, status: "delivered", created_at: last, updated_at: last },
    );
  }
  await insert("whatsapp_conversations", conversations);
  await insert("whatsapp_messages", waMessages);
  const [waCampaign] = await insert("whatsapp_campaigns", [
    { practice_id: P, name: "October recall drive", template_id: waTemplates[1].id, status: "COMPLETED", audience_filter: { pipeline_id: pipeline.id, stage_ids: [], status: "open" }, variable_mapping: [{ source: "lead_name" }, { source: "static", value: "Dr. Dipti Dental Clinic" }], total_recipients: 8, sent_count: 8, delivered_count: 7, read_count: 5, replied_count: 2, failed_count: 1, created_by: DOC, started_at: daysAgo(5, 10), completed_at: daysAgo(5, 10, 6), created_at: daysAgo(5, 9), updated_at: daysAgo(5, 10, 6) },
    { practice_id: P, name: "Festive whitening offer", template_id: waTemplates[2].id, status: "DRAFT", audience_filter: { pipeline_id: pipeline.id, stage_ids: [stages[1].id, stages[2].id], status: "open" }, variable_mapping: [{ source: "lead_name" }, { source: "static", value: "Dr. Dipti Dental Clinic" }], total_recipients: 0, created_by: DOC, created_at: daysAgo(1, 16), updated_at: daysAgo(1, 16) },
  ]);
  const recStatus = ["replied", "read", "read", "delivered", "delivered", "sent", "read", "failed"];
  await insert(
    "whatsapp_campaign_recipients",
    L.slice(0, 8).map((lead, i) => {
      const sentAt = daysAgo(5, 10, i);
      const s = recStatus[i];
      return {
        campaign_id: waCampaign.id,
        practice_id: P,
        lead_id: lead.id,
        phone: `91${lead.phone}`,
        name: lead.full_name,
        status: s,
        wamid: s === "failed" ? null : `wamid.${uuid()}`,
        error_message: s === "failed" ? "Message undeliverable: number is not on WhatsApp" : null,
        error_code: s === "failed" ? 131026 : null,
        sent_at: s === "failed" ? null : sentAt,
        delivered_at: ["delivered", "read", "replied"].includes(s) ? new Date(sentAt.getTime() + 60000) : null,
        read_at: ["read", "replied"].includes(s) ? new Date(sentAt.getTime() + 600000) : null,
        replied_at: s === "replied" ? new Date(sentAt.getTime() + 1800000) : null,
      };
    }),
  );

  // ---- Email -------------------------------------------------------------
  console.log("Email");
  await client.query(
    `INSERT INTO email_settings (practice_id, is_enabled, default_from_name, signature, updated_by)
     VALUES ($1, true, $2, $3, $4) ON CONFLICT (practice_id) DO UPDATE SET is_enabled = true, default_from_name = EXCLUDED.default_from_name, signature = EXCLUDED.signature`,
    [P, "Dr. Dipti Dental Clinic", "Warm regards,\nDr. Dipti Dental Clinic\n+91 99999 99998", DOC],
  );
  const blocks = (title, paras, button) => [
    { type: "title", text: title, align: "left" },
    ...paras.map((text) => ({ type: "paragraph", text, align: "left" })),
    ...(button ? [{ type: "button", text: button.text, url: button.url, align: "center", color: "#0f766e" }] : []),
    { type: "divider" },
    { type: "paragraph", text: "Dr. Dipti Dental Clinic · +91 99999 99998", align: "center" },
  ];
  const tplSpecs = [
    ["Welcome new enquiry", "Thanks for reaching out to {{clinic_name}}", "welcome", blocks("Welcome, {{first_name}}!", ["Thank you for contacting {{clinic_name}}. One of our team members will call you within a working day to understand your concern and suggest the next step.", "In the meantime, feel free to reply to this email with any questions."], { text: "Book a consultation", url: "https://example.com/book" })],
    ["Consultation follow-up", "Your treatment plan from {{clinic_name}}", "follow_up", blocks("Hi {{first_name}}, here is your plan", ["It was lovely meeting you. As discussed, the recommended treatment and its estimate are attached. We have kept the plan flexible so you can start whenever you are ready.", "Reply to this email or call us to book your first sitting."], { text: "Ask a question", url: "mailto:doctor@example.com" })],
    ["Appointment reminder", "Reminder: your appointment on {{appointment_date}}", "reminder", blocks("See you soon, {{first_name}}", ["This is a reminder of your appointment at {{clinic_name}}. Please arrive 10 minutes early and bring any previous reports or X-rays.", "If you need to reschedule, reply to this email."], null)],
    ["Festive whitening offer", "Brighten your smile this festive season", "marketing", blocks("Festive offer: 20% off teeth whitening", ["Get a brighter smile before the celebrations begin. Book a whitening session this month and save 20%.", "Offer valid till the end of the month. Limited slots available."], { text: "Claim the offer", url: "https://example.com/offer" })],
  ];
  const renderText = (b) => b.filter((x) => x.text).map((x) => x.text).join("\n\n");
  const renderHtml = (b) => `<table role="presentation" width="100%"><tbody>${b.map((x) => (x.type === "title" ? `<tr><td><h1>${x.text}</h1></td></tr>` : x.type === "paragraph" ? `<tr><td><p>${x.text}</p></td></tr>` : x.type === "button" ? `<tr><td><a href="${x.url}">${x.text}</a></td></tr>` : `<tr><td><hr/></td></tr>`)).join("")}</tbody></table>`;
  const emailTemplates = await insert(
    "email_templates",
    tplSpecs.map(([name, subject, category, content_blocks]) => ({ practice_id: P, name, subject, category, builder_type: "blocks", content_blocks, body_html: renderHtml(content_blocks), body_text: renderText(content_blocks), is_active: true, created_by: DOC })),
  );

  const clinicEmail = "clinic@drdipti.example.com";
  const emailMessages = [];
  const inboundSpecs = [
    [0, "Implant cost enquiry", "Hello, I saw your website and would like to know the cost of a single dental implant. Also, do you offer EMI options?", false, 30],
    [1, "Re: Your treatment plan from Dr. Dipti Dental Clinic", "Thank you doctor. Can we start the aligners next month? I will be travelling till the 20th.", false, 180],
    [3, "Appointment reschedule", "Hi, I need to move my Saturday appointment to the following week. Any slot after 4 pm works.", true, 1500],
    [7, "Insurance pre-authorisation", "Please find attached my insurance card. Could you send the pre-auth form for the root canal?", false, 2800],
    [10, "Dentures for my father", "My father (72) needs complete dentures. Is a home visit possible for the first consultation?", true, 4000],
    [13, "Thank you!", "The whitening results are amazing, thank you so much to the whole team!", true, 6000],
  ];
  for (const [leadIdx, subject, body, read, minutesAgo] of inboundSpecs) {
    const lead = L[leadIdx];
    const at = new Date(Date.now() - minutesAgo * 60000);
    const thread = uuid();
    emailMessages.push({ practice_id: P, direction: "inbound", folder: "inbox", status: "received", from_address: lead.email, from_name: lead.full_name, to_addresses: [clinicEmail], subject, body_text: body, body_html: `<p>${body}</p>`, lead_id: lead.id, thread_id: thread, is_read: read, provider_message_id: `<${uuid()}@example.com>`, received_at: at, created_at: at });
    if (read) {
      const replyAt = new Date(at.getTime() + 45 * 60000);
      emailMessages.push({ practice_id: P, direction: "outbound", folder: "sent", status: "sent", from_address: clinicEmail, from_name: "Dr. Dipti Dental Clinic", to_addresses: [lead.email], subject: `Re: ${subject}`, body_text: `Hi ${lead.full_name.split(" ")[0]},\n\nThanks for writing in. We have noted your request and will confirm shortly.\n\nWarm regards,\nDr. Dipti Dental Clinic`, body_html: `<p>Hi ${lead.full_name.split(" ")[0]},</p><p>Thanks for writing in. We have noted your request and will confirm shortly.</p>`, lead_id: lead.id, thread_id: thread, is_read: true, sent_at: replyAt, created_by: pick(users, leadIdx), created_at: replyAt });
    }
  }
  const pt = patients[5];
  emailMessages.push(
    { practice_id: P, direction: "outbound", folder: "sent", status: "sent", from_address: clinicEmail, from_name: "Dr. Dipti Dental Clinic", to_addresses: [L[2].email], subject: "Your treatment plan from Dr. Dipti Dental Clinic", body_text: emailTemplates[1] ? tplSpecs[1][3].map((b) => b.text).filter(Boolean).join("\n\n") : "", body_html: renderHtml(tplSpecs[1][3]), template_id: emailTemplates[1].id, lead_id: L[2].id, is_read: true, sent_at: daysAgo(4, 11), created_by: DOC, created_at: daysAgo(4, 11) },
    { practice_id: P, direction: "outbound", folder: "sent", status: "failed", from_address: clinicEmail, from_name: "Dr. Dipti Dental Clinic", to_addresses: ["bounce@invalid-domain.test"], subject: "Reminder: your appointment on Friday", body_text: "This is a reminder of your appointment.", body_html: "<p>This is a reminder of your appointment.</p>", template_id: emailTemplates[2].id, is_read: true, error_message: "550 5.1.1 The email account that you tried to reach does not exist", created_by: STAFF, created_at: daysAgo(2, 9) },
    { practice_id: P, direction: "outbound", folder: "sent", status: "queued", from_address: clinicEmail, from_name: "Dr. Dipti Dental Clinic", to_addresses: [pt?.email || "patient@example.com"], subject: "Your invoice from Dr. Dipti Dental Clinic", body_text: "Please find your invoice attached. Thank you for choosing us.", body_html: "<p>Please find your invoice attached. Thank you for choosing us.</p>", patient_id: pt?.id ?? null, is_read: true, created_by: DOC, created_at: new Date(Date.now() - 5 * 60000) },
    { practice_id: P, direction: "inbound", folder: "trash", status: "received", from_address: "promo@dental-supplies.example.com", from_name: "Dental Supplies Co", to_addresses: [clinicEmail], subject: "Mega sale on consumables", body_text: "Up to 40% off this week only.", body_html: "<p>Up to 40% off this week only.</p>", is_read: true, received_at: daysAgo(9, 8), created_at: daysAgo(9, 8) },
  );
  const emailIds = await insert("email_messages", emailMessages);

  const emailCampaigns = await insert("email_campaigns", [
    { practice_id: P, name: "Welcome - September enquiries", template_id: emailTemplates[0].id, audience_type: "leads", audience: { pipeline_id: pipeline.id, stage_ids: [stages[0].id, stages[1].id], status: "open" }, status: "sent", started_at: daysAgo(7, 10), sent_at: daysAgo(7, 10, 4), created_by: DOC, created_at: daysAgo(7, 9), updated_at: daysAgo(7, 10, 4) },
    { practice_id: P, name: "Festive whitening offer", template_id: emailTemplates[3].id, audience_type: "patients", audience: { last_visit_months: 12 }, status: "scheduled", scheduled_at: daysAgo(-3, 10), created_by: DOC, created_at: daysAgo(1, 15), updated_at: daysAgo(1, 15) },
    { practice_id: P, name: "Expo visitors follow-up", template_id: emailTemplates[1].id, audience_type: "upload", audience: {}, status: "draft", created_by: STAFF, created_at: daysAgo(0, 9), updated_at: daysAgo(0, 9) },
  ]);
  const recStatuses = ["sent", "sent", "sent", "failed", "sent", "skipped", "sent"];
  await insert(
    "email_campaign_recipients",
    L.slice(0, 7).map((lead, i) => ({ campaign_id: emailCampaigns[0].id, practice_id: P, lead_id: lead.id, email_address: lead.email, fullname: lead.full_name, status: recStatuses[i], error_message: recStatuses[i] === "failed" ? "Mailbox full" : recStatuses[i] === "skipped" ? "Unsubscribed" : null, sent_at: recStatuses[i] === "sent" ? daysAgo(7, 10, i) : null })),
  );
  await insert(
    "email_campaign_recipients",
    importRowsData.slice(0, 3).map(([fullname, , email_address]) => ({ campaign_id: emailCampaigns[2].id, practice_id: P, email_address, fullname, status: "pending" })),
  );
  const [rule] = await insert("email_automation_rules", [
    { practice_id: P, name: "Welcome email on new enquiry", trigger_type: "lead_created", pipeline_id: pipeline.id, template_id: emailTemplates[0].id, is_active: true, created_by: DOC },
    { practice_id: P, name: "Send plan when moved to 'Treatment Plan Shared'", trigger_type: "stage_reached", pipeline_id: pipeline.id, stage_id: stages[3]?.id ?? stages[0].id, template_id: emailTemplates[1].id, is_active: false, created_by: DOC },
  ]);
  await insert("email_automation_runs", [
    { rule_id: rule.id, practice_id: P, lead_id: L[0].id, event_key: `lead_created:${L[0].id}`, status: "sent", message_id: emailIds[0].id, created_at: daysAgo(3, 10) },
    { rule_id: rule.id, practice_id: P, lead_id: L[6].id, event_key: `lead_created:${L[6].id}`, status: "skipped", error_message: "Lead has no email address", created_at: daysAgo(2, 11) },
  ]);

  // ---- Patient messages --------------------------------------------------
  console.log("Patient messages");
  await insert("patient_message_rules", [
    { practice_id: P, kind: "recall", is_active: true, recall_months: 6, whatsapp_template_id: waTemplates[1].id, variable_mapping: [{ source: "patient_name" }, { source: "static", value: "Dr. Dipti Dental Clinic" }], email_subject: "Time for your dental check-up", email_body: "Hi {{first_name}},\n\nIt's been {{months}} months since your last visit to {{clinic}}. Regular check-ups keep small problems small. Reply to this email or call us to book a convenient time.\n\nSee you soon,\n{{clinic}}" },
    { practice_id: P, kind: "birthday", is_active: true, recall_months: 6, whatsapp_template_id: waTemplates[2].id, variable_mapping: [{ source: "patient_name" }, { source: "static", value: "Dr. Dipti Dental Clinic" }], email_subject: "Happy birthday from {{clinic}}!", email_body: "Dear {{first_name}},\n\nEveryone at {{clinic}} wishes you a very happy birthday and a year full of smiles.\n\nWarm wishes,\n{{clinic}}" },
  ]);
  const broadcasts = await insert("patient_broadcasts", [
    { practice_id: P, name: "Diwali greetings 2026", audience: { all: true }, whatsapp_template_id: waTemplates[2].id, variable_mapping: [{ source: "patient_name" }, { source: "static", value: "Dr. Dipti Dental Clinic" }], email_subject: "Happy Diwali from {{clinic}}", email_body: "Dear {{first_name}},\n\nWishing you and your family a bright and happy Diwali from all of us at {{clinic}}.", status: "completed", created_by: DOC, started_at: daysAgo(10, 9), completed_at: daysAgo(10, 9, 20), created_at: daysAgo(11, 17) },
    { practice_id: P, name: "Clinic closed on 2nd Nov", audience: { visited_within_months: 12 }, email_subject: "Clinic closed on 2 November", email_body: "Dear {{first_name}},\n\nThe clinic will remain closed on 2 November. For emergencies call +91 99999 99998.", status: "draft", created_by: STAFF, created_at: daysAgo(0, 8) },
  ]);
  const pmRows = [];
  patients.slice(0, 14).forEach((p, i) => {
    const channel = i % 2 ? "email" : "whatsapp";
    const status = i === 6 ? "failed" : i === 9 ? "skipped" : "sent";
    pmRows.push({ practice_id: P, patient_id: p.id, kind: "broadcast", broadcast_id: broadcasts[0].id, channel, to_address: channel === "email" ? p.email || "patient@example.com" : `91${p.phone}`, status, error: status === "failed" ? "Number not on WhatsApp" : null, dedupe_key: `broadcast:${broadcasts[0].id}:${p.id}:${channel}`, sent_at: status === "sent" ? daysAgo(10, 9, i) : null, created_at: daysAgo(10, 9) });
  });
  patients.slice(14, 20).forEach((p, i) => {
    const channel = i % 2 ? "email" : "whatsapp";
    pmRows.push({ practice_id: P, patient_id: p.id, kind: i < 4 ? "recall" : "birthday", channel, to_address: channel === "email" ? p.email || "patient@example.com" : `91${p.phone}`, status: i === 5 ? "pending" : "sent", dedupe_key: `${i < 4 ? "recall" : "birthday"}:${dateAgo(i)}:${p.id}:${channel}`, sent_at: i === 5 ? null : daysAgo(i, 9), created_at: daysAgo(i, 8) });
  });
  await insert("patient_messages", pmRows);

  // ---- Notifications -----------------------------------------------------
  console.log("Notifications & failed jobs");
  await insert(
    "user_notifications",
    users.flatMap((user_id) => [
      { practice_id: P, user_id, type: "lead.assigned", title: "New lead assigned to you", body: `${L[0].full_name} - ${L[0].notes}`, link: `/leads/${L[0].id}`, lead_id: L[0].id, created_at: new Date(Date.now() - 20 * 60000) },
      { practice_id: P, user_id, type: "lead.follow_up_due", title: "Follow-up due today", body: `Call back ${L[1].full_name} about the quote`, link: `/leads/${L[1].id}`, lead_id: L[1].id, created_at: daysAgo(0, 9) },
      { practice_id: P, user_id, type: "whatsapp.inbound", title: "New WhatsApp message", body: `${L[0].full_name}: Hi, I wanted to know the cost of implants.`, link: `/whatsapp`, lead_id: L[0].id, created_at: new Date(Date.now() - 25 * 60000) },
      { practice_id: P, user_id, type: "inventory.low_stock", title: "Low stock: Autoclave pouches", body: "Stock is 0, reorder level is 2.", link: `/inventory`, read_at: daysAgo(1, 12), created_at: daysAgo(1, 8) },
      { practice_id: P, user_id, type: "lab.overdue", title: "Lab order LAB-0006 is overdue", body: "Clear aligners set from Precision Dental Lab was due 4 days ago.", link: `/lab`, read_at: daysAgo(2, 10), created_at: daysAgo(3, 9) },
    ]),
  );

  await insert(
    "pgboss.job",
    [
      { name: "whatsapp.send", state: "failed", retry_limit: 4, retry_count: 4, data: { practiceId: P, conversationId: conversations[4].id, text: "Please share the clinic address.", seeded: true }, output: { message: "Meta error 131026: Message undeliverable" }, started_on: daysAgo(1, 10), created_on: daysAgo(1, 10), completed_on: daysAgo(1, 10, 3) },
      { name: "email.send", state: "failed", retry_limit: 0, retry_count: 0, data: { practiceId: P, messageId: emailIds[emailIds.length - 3].id, seeded: true }, output: { message: "550 5.1.1 The email account that you tried to reach does not exist" }, started_on: daysAgo(2, 9), created_on: daysAgo(2, 9), completed_on: daysAgo(2, 9, 1) },
      { name: "leads.import", state: "failed", retry_limit: 3, retry_count: 3, data: { practiceId: P, importId: importRows[2].id, seeded: true }, output: { message: "Row 4: phone column is empty for 37 rows" }, started_on: daysAgo(3, 14), created_on: daysAgo(3, 14), completed_on: daysAgo(3, 14, 1) },
    ],
    { returning: null },
  );

  // ---- Treatment records -------------------------------------------------
  console.log("Treatment records (active treatments)");
  await seedTreatmentRecords(client);

  await client.query("COMMIT");
  console.log("\nDemo data seeded for practice", practice.name);
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await client.query("ROLLBACK");
  } catch {
    /* ignore */
  }
  await client.end();
  process.exit(1);
});
