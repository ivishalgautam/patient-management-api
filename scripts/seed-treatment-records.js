// Fills every ongoing (active) treatment with clinical records wherever a
// section is empty: plan, visits, prescriptions, X-rays, vitals, reports
// (treatment history) and a first payment. Existing records are left alone,
// so it is safe to run again; it adds only where a section is still blank.
//
//   npm run seed:records            # fill blanks
//   npm run seed:records -- --reset # remove the rows this script added, then fill
//
// Also run by `npm run seed:demo`. Seeded rows are remembered in
// demo_seed_rows so --reset removes exactly those and nothing real.
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reportImage, xrayImage } from "./lib/demo-images.js";

const JSON_COLS = new Set(["visit_notes", "data", "notes", "affected_tooths"]);
const uuid = () => crypto.randomUUID();

const daysAgo = (n, hour = 10, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

// Deterministic variety per treatment, so reruns look the same.
const rng = (seed) => {
  let s = parseInt(seed.replace(/-/g, "").slice(0, 8), 16) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// Clinical content by the kind of service (matched on the service name).
// rx rows: [medicine_name, dosage, tablet_amount, frequency, duration, notes]
const KINDS = [
  {
    match: /root canal|rct|pulp|obturation|post and core/i,
    cost: [4500, 9000],
    teeth: ["36", "46", "16", "26", "37", "47"],
    diagnosis: ["IOPA", "Periapical radiolucency"],
    plan: ["Access opening and working length determination", "Biomechanical preparation, calcium hydroxide dressing", "Obturation and post-endodontic restoration"],
    visits: [
      "Access opening done under LA. Working length established with apex locator. Ca(OH)2 placed, temporised.",
      "Canals irrigated with 3% NaOCl, master cone fit verified radiographically. Patient asymptomatic.",
      "Obturation completed with gutta-percha and sealer. Post-op IOPA satisfactory. Composite core placed.",
    ],
    rx: [
      ["Amoxicillin", "500 mg", 1, "morning", 5, "After food"],
      ["Ibuprofen + Paracetamol", "400/325 mg", 1, "evening", 3, "Only if pain"],
      ["Chlorhexidine mouthwash", "10 ml", 1, "morning", 7, "Rinse, do not swallow"],
    ],
    xray: ["Pre-op IOPA", "Working length IOPA", "Post-obturation IOPA"],
    report: "Pulp vitality test: no response on cold and EPT. Tenderness on percussion positive. Diagnosis: symptomatic apical periodontitis.",
  },
  {
    match: /crown|veneer|inlay|onlay|cementation/i,
    cost: [6000, 15000],
    teeth: ["11", "21", "14", "24", "36", "46"],
    diagnosis: ["IOPA", "Adequate ferrule"],
    plan: ["Tooth preparation and shade selection", "Impression / intra-oral scan, temporary crown", "Try-in, occlusal adjustment and cementation"],
    visits: [
      "Tooth preparation completed, shade A2 selected. Digital impression taken. Temporary crown cemented.",
      "Trial of restoration: marginal fit and contacts checked, minor occlusal adjustment.",
      "Final cementation with resin cement. Excess removed, occlusion verified. Post-op instructions given.",
    ],
    rx: [
      ["Ketorolac", "10 mg", 1, "evening", 2, "If sensitivity after preparation"],
      ["Chlorhexidine gel", "Pea size", 1, "evening", 7, "Apply on gums near the prepared tooth"],
    ],
    xray: ["Pre-op IOPA", "Bitewing"],
    report: "Lab prescription: zirconia layered crown, shade A2, 0.5 mm margins. Lab returned fit check approved.",
  },
  {
    match: /scaling|sacling|polish|curettage|fluoride|coronoplasty|splint/i,
    cost: [1200, 3500],
    teeth: ["Full arch"],
    diagnosis: ["OPG", "Generalised bone loss - mild"],
    plan: ["Full mouth ultrasonic scaling", "Polishing and oral hygiene instruction", "Review in 3 months"],
    visits: [
      "Full mouth scaling done with ultrasonic scaler. Moderate calculus, generalised bleeding on probing.",
      "Polishing completed. Brushing technique demonstrated; interdental brushes advised.",
    ],
    rx: [
      ["Chlorhexidine mouthwash", "10 ml", 2, "morning", 10, "Twice daily after brushing"],
      ["Potassium nitrate toothpaste", "Pea size", 2, "evening", 30, "For sensitivity"],
    ],
    xray: ["OPG"],
    report: "Periodontal charting: probing depths 3-4 mm generalised, 5 mm at 36 distal and 46 distal. Plaque index 2.1.",
  },
  {
    match: /extraction|mucocele|tongue tie|bone graft|implant/i,
    cost: [1500, 35000],
    teeth: ["38", "48", "18", "28", "36", "46"],
    diagnosis: ["OPG", "IOPA"],
    plan: ["Pre-operative assessment and consent", "Surgical procedure under local anaesthesia", "Suture removal and review at 7 days"],
    visits: [
      "Procedure completed under 2% lignocaine with adrenaline. Haemostasis achieved, sutures placed. Post-op instructions given.",
      "Suture removal done. Healing satisfactory, no signs of infection.",
    ],
    rx: [
      ["Amoxicillin + Clavulanate", "625 mg", 1, "morning", 5, "After food, complete the course"],
      ["Aceclofenac + Paracetamol", "100/325 mg", 1, "afternoon", 3, "After food"],
      ["Pantoprazole", "40 mg", 1, "morning", 5, "Before breakfast"],
    ],
    xray: ["Pre-op OPG", "Pre-op IOPA"],
    report: "Blood investigation (external lab): Hb 13.2 g/dL, RBS 96 mg/dL, BT 2 min 30 s, CT 4 min. Fit for minor oral surgery.",
  },
  {
    match: /aligner|brace|orthodont|retainer|retatiner|button/i,
    cost: [25000, 90000],
    teeth: ["Upper and lower arch"],
    diagnosis: ["OPG", "Lateral cephalogram"],
    plan: ["Records: photographs, scan, OPG and lateral ceph", "Bonding / aligner delivery", "Monthly reviews and IPR as planned", "Retention phase with fixed and removable retainers"],
    visits: [
      "Records taken: intra-oral scan, extra-oral and intra-oral photographs. Treatment plan discussed.",
      "Aligners 1-4 delivered. Fit checked, attachments bonded. Wear 22 hours a day explained.",
      "Review: tracking well on aligner 4. IPR 0.2 mm between 31-32 and 41-42. Next set issued.",
    ],
    rx: [
      ["Orthodontic wax", "As needed", 1, "evening", 30, "Over any sharp attachment"],
      ["Paracetamol", "500 mg", 1, "evening", 2, "If discomfort after a new set"],
    ],
    xray: ["OPG", "Lateral cephalogram"],
    report: "Cephalometric analysis: SNA 82, SNB 78, ANB 4. Class II div 1 skeletal pattern, average growth. Crowding 5 mm upper, 3 mm lower.",
  },
  {
    match: /denture|night guard|tmj/i,
    cost: [8000, 45000],
    teeth: ["Upper arch", "Lower arch"],
    diagnosis: ["OPG"],
    plan: ["Primary impression and custom tray", "Secondary impression and jaw relation", "Try-in, then insertion and follow-up adjustments"],
    visits: [
      "Primary impressions taken with alginate. Custom trays requested from lab.",
      "Secondary impressions and jaw relation recorded. Shade and mould selected.",
      "Wax try-in: aesthetics and occlusion approved by patient.",
    ],
    rx: [["Denture adhesive", "Thin layer", 1, "morning", 30, "Rinse the denture before use"]],
    xray: ["OPG"],
    report: "Lab: processed acrylic denture returned; occlusion verified on articulator. Minor flange trimming required at insertion.",
  },
  {
    match: /filling|restoration|gic|sealant|composite|compostie|compostite|cmposite/i,
    cost: [1500, 5000],
    teeth: ["36", "46", "16", "26", "15", "25", "37"],
    diagnosis: ["IOPA", "Bitewing - proximal caries"],
    plan: ["Caries excavation", "Composite restoration with incremental curing", "Finishing and polishing"],
    visits: [
      "Caries removed under LA. Etch-bond-composite restoration placed in increments. Occlusion checked.",
      "Review: restoration intact, no sensitivity. Polished and contacts verified.",
    ],
    rx: [
      ["Fluoride toothpaste", "Pea size", 2, "morning", 30, "Twice daily"],
      ["Paracetamol", "500 mg", 1, "evening", 2, "If sensitivity"],
    ],
    xray: ["Pre-op bitewing", "Post-op IOPA"],
    report: "Caries risk assessment: moderate. Diet counselling given; sugary snack frequency 3-4 times a day.",
  },
  {
    match: /whiten|bleach/i,
    cost: [6000, 15000],
    teeth: ["Upper and lower anterior"],
    diagnosis: ["None required"],
    plan: ["Prophylaxis and shade recording", "In-office bleaching, two cycles", "Home maintenance kit and review"],
    visits: [
      "Baseline shade A3. Gingival barrier placed, 35% hydrogen peroxide gel for 2 x 15 minutes. Shade after: A1.",
      "Review: mild transient sensitivity resolved. Patient satisfied with the result.",
    ],
    rx: [["Potassium nitrate toothpaste", "Pea size", 2, "morning", 14, "For sensitivity"]],
    xray: ["Pre-op IOPA"],
    report: "Shade record: baseline A3 (Vita classical), post treatment A1. Patient advised to avoid staining foods for 48 hours.",
  },
  {
    match: /./,
    cost: [500, 3000],
    teeth: ["Full mouth"],
    diagnosis: ["OPG"],
    plan: ["Clinical examination and history", "Investigations as indicated", "Discuss findings and treatment options"],
    visits: [
      "Detailed history and intra-oral examination done. Findings explained to patient and treatment options discussed.",
      "Follow-up: patient reviewed, no new complaints. Oral hygiene instructions reinforced.",
    ],
    rx: [["Chlorhexidine mouthwash", "10 ml", 2, "morning", 7, "Twice daily"]],
    xray: ["OPG"],
    report: "Consultation summary: chief complaint reviewed, medical history non-contributory. Advised comprehensive treatment plan.",
  },
];

const TOOTH_COLORS = ["#FF0000", "#000000", "#0066FF", "#00A651"];
const VITALS = {
  temperature: ["98.2 F", "98.4 F", "98.6 F", "97.9 F", "99.1 F"],
  weight: ["54 kg", "61 kg", "68 kg", "72 kg", "77 kg", "84 kg"],
  blood_pressure: ["118/76 mmHg", "120/80 mmHg", "124/82 mmHg", "130/84 mmHg", "112/74 mmHg"],
  oxygen_saturation: ["97%", "98%", "98%", "99%", "96%"],
};

// Writes the placeholder images once; returns their stored paths
// ("public/demo/<file>", served under /public/ like every upload).
function ensureImages(publicRoot) {
  const dir = path.join(publicRoot, "demo");
  fs.mkdirSync(dir, { recursive: true });
  const files = { xray: [], report: [] };
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, `xray-${i + 1}.png`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, xrayImage(i));
    files.xray.push(`public/demo/xray-${i + 1}.png`);
  }
  for (let i = 0; i < 2; i++) {
    const f = path.join(dir, `report-${i + 1}.png`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, reportImage(i));
    files.report.push(`public/demo/report-${i + 1}.png`);
  }
  return files;
}

// pg turns JS arrays into Postgres arrays; jsonb columns are stringified.
async function insertRows(client, table, rows) {
  if (!rows.length) return;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  for (let i = 0; i < rows.length; i += 300) {
    const slice = rows.slice(i, i + 300);
    const values = [];
    const tuples = slice.map((r) => {
      const placeholders = cols.map((c) => {
        const v = r[c];
        if (v === undefined) return "DEFAULT";
        values.push(JSON_COLS.has(c) ? JSON.stringify(v) : v);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")}`, values);
    await client.query(`INSERT INTO demo_seed_rows (table_name, row_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [
      table,
      slice.map((r) => r.id),
    ]);
  }
}

const ensureLedger = (client) =>
  client.query(`CREATE TABLE IF NOT EXISTS demo_seed_rows (table_name text NOT NULL, row_id uuid NOT NULL, PRIMARY KEY (table_name, row_id))`);

// Removes what an earlier run added (and nothing else).
export async function resetTreatmentRecords(client) {
  await ensureLedger(client);
  const tables = (await client.query(`SELECT DISTINCT table_name FROM demo_seed_rows`)).rows.map((r) => r.table_name);
  for (const t of tables) {
    const res = await client.query(`DELETE FROM ${t} WHERE id IN (SELECT row_id FROM demo_seed_rows WHERE table_name = $1)`, [t]);
    console.log(`  removed ${res.rowCount} from ${t}`);
  }
  await client.query(`DELETE FROM demo_seed_rows`);
}

// `client` is a connected pg client inside the caller's transaction.
export async function seedTreatmentRecords(client, { publicRoot = path.resolve("public") } = {}) {
  await ensureLedger(client);
  const images = ensureImages(publicRoot);

  const { rows: treatments } = await client.query(`
    SELECT t.id, t.patient_id, t.created_at, s.name AS service_name,
           coalesce(d.user_id, t.added_by) AS doctor_user_id,
           EXISTS (SELECT 1 FROM treatment_plans x WHERE x.treatment_id = t.id) AS has_plan,
           EXISTS (SELECT 1 FROM treatment_visits x WHERE x.treatment_id = t.id) AS has_visits,
           EXISTS (SELECT 1 FROM treatment_prescriptions x WHERE x.treatment_id = t.id) AS has_rx,
           EXISTS (SELECT 1 FROM xrays x WHERE x.treatment_id = t.id) AS has_xrays,
           EXISTS (SELECT 1 FROM investigations x WHERE x.treatment_id = t.id) AS has_vitals,
           EXISTS (SELECT 1 FROM treatment_histories x WHERE x.treatment_id = t.id) AS has_history,
           EXISTS (SELECT 1 FROM treatment_payments x WHERE x.treatment_id = t.id AND x.deleted_at IS NULL) AS has_payment
      FROM treatments t
      JOIN services s ON s.id = t.service_id
      JOIN clinics c ON c.id = t.clinic_id
      LEFT JOIN doctors d ON d.id = c.doctor_id
     WHERE t.status = 'active'
     ORDER BY t.created_at`);

  const out = {
    treatment_plans: [],
    treatment_visits: [],
    treatment_prescriptions: [],
    xrays: [],
    investigations: [],
    treatment_histories: [],
    treatment_payments: [],
  };
  const stamp = (r, maxDaysAgo) => {
    const d = daysAgo(between(r, 0, maxDaysAgo), between(r, 9, 18), pick(r, [0, 15, 30, 45]));
    return { created_at: d, updated_at: d };
  };

  for (const t of treatments) {
    const r = rng(t.id);
    const kind = KINDS.find((k) => k.match.test(t.service_name));
    const by = t.doctor_user_id;
    const cost = Math.round(between(r, kind.cost[0], kind.cost[1]) / 100) * 100;
    // Treatment age in days (3..60) so records fall after it started.
    const age = Math.min(60, Math.max(3, Math.floor((Date.now() - new Date(t.created_at)) / 86400000)));

    if (!t.has_plan) {
      const teeth = kind.teeth[0].length <= 2 ? [...new Set([pick(r, kind.teeth), pick(r, kind.teeth)])] : [kind.teeth[0]];
      out.treatment_plans.push({
        id: uuid(),
        treatment_id: t.id,
        patient_id: t.patient_id,
        total_cost: cost,
        added_by: by,
        notes: kind.plan.map((note) => ({ note })),
        affected_tooths: teeth.map((tooth, i) => ({ tooth, color: TOOTH_COLORS[i % TOOTH_COLORS.length] })),
        radiographic_diagnosis: kind.diagnosis,
        ...stamp(r, age),
      });
    }
    if (!t.has_visits) {
      const n = between(r, 1, Math.min(3, kind.visits.length));
      for (let i = 0; i < n; i++) {
        out.treatment_visits.push({
          id: uuid(),
          treatment_id: t.id,
          added_by: by,
          visit_notes: [{ note: kind.visits[i] }, ...(i === n - 1 ? [{ note: `Next visit in ${pick(r, [1, 2, 3])} week(s).` }] : [])],
          ...stamp(r, Math.max(1, age - i * 7)),
        });
      }
    }
    if (!t.has_rx) {
      const meds = kind.rx.slice(0, between(r, Math.min(2, kind.rx.length), kind.rx.length));
      out.treatment_prescriptions.push({
        id: uuid(),
        treatment_id: t.id,
        added_by: by,
        data: meds.map(([medicine_name, dosage, tablet_amount, frequency, duration, notes]) => ({ medicine_name, dosage, tablet_amount, frequency, duration, notes })),
        ...stamp(r, age),
      });
    }
    if (!t.has_xrays) {
      const n = between(r, 1, Math.min(2, kind.xray.length));
      for (let i = 0; i < n; i++) {
        out.xrays.push({
          id: uuid(),
          treatment_id: t.id,
          added_by: by,
          title: kind.xray[i],
          files: [images.xray[(parseInt(t.id.slice(0, 2), 16) + i) % images.xray.length]],
          ...stamp(r, Math.max(1, age - i * 10)),
        });
      }
    }
    if (!t.has_vitals) {
      out.investigations.push({
        id: uuid(),
        treatment_id: t.id,
        added_by: by,
        temperature: pick(r, VITALS.temperature),
        weight: pick(r, VITALS.weight),
        blood_pressure: pick(r, VITALS.blood_pressure),
        oxygen_saturation: pick(r, VITALS.oxygen_saturation),
        ...stamp(r, age),
      });
    }
    if (!t.has_history) {
      out.treatment_histories.push({
        id: uuid(),
        treatment_id: t.id,
        added_by: by,
        content: kind.report,
        files: [images.report[parseInt(t.id.slice(2, 4), 16) % images.report.length]],
        ...stamp(r, age),
      });
    }
    if (!t.has_payment) {
      const share = pick(r, [0.25, 0.4, 0.5, 1]);
      out.treatment_payments.push({
        id: uuid(),
        treatment_id: t.id,
        added_by: by,
        payment_type: share === 1 ? "full" : pick(r, ["advance", "installment"]),
        payment_method: pick(r, ["cash", "upi", "upi", "other"]),
        amount_paid: Math.max(100, Math.round((cost * share) / 100) * 100),
        advance_used: 0,
        remarks: share === 1 ? "Paid in full" : pick(r, ["First instalment", "Advance at start of treatment", "Paid at reception"]),
        ...stamp(r, age),
      });
    }
  }

  for (const [table, rows] of Object.entries(out)) {
    await insertRows(client, table, rows);
    console.log(`  ${table}: +${rows.length}`);
  }
  return { treatments: treatments.length, added: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) };
}

// Run directly: `node scripts/seed-treatment-records.js [--reset]`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const client = new pg.Client({
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USERNAME,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  });
  const run = async () => {
    await client.connect();
    await client.query("BEGIN");
    if (process.argv.includes("--reset")) {
      console.log("Removing earlier demo treatment records...");
      await resetTreatmentRecords(client);
    }
    console.log("Treatment records");
    const result = await seedTreatmentRecords(client);
    await client.query("COMMIT");
    console.log(`\nChecked ${result.treatments} active treatments.`);
    await client.end();
  };
  run().catch(async (e) => {
    console.error(e);
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    await client.end();
    process.exit(1);
  });
}
