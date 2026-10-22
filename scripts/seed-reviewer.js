// Creates (or refreshes) the two accounts that app-store reviewers use to
// sign in to the published apps, so the real clinic logins never leave the
// practice:
//
//   staff app   -> role "staff", attached to the first clinic as clinic staff
//                  (a second "doctor" account would see nothing: clinics and
//                  bookings are scoped to the doctor who owns them)
//   patient app -> role "patient" in the same practice, with one upcoming and
//                  one completed appointment plus an active treatment whose
//                  plan/visits/prescriptions/x-rays/vitals/reports/payment are
//                  filled by seed-treatment-records.js
//
//   npm run seed:reviewer                    # create or refresh with defaults
//   npm run seed:reviewer -- --staff-pass X --patient-pass Y
//   npm run seed:reviewer -- --reset         # remove both accounts and their rows
//
// Flags: --staff-user --staff-pass --patient-user --patient-pass --reset
// Env fallbacks: REVIEWER_STAFF_USER/PASS, REVIEWER_PATIENT_USER/PASS.
// Safe to re-run: existing accounts get the password reset and any missing
// links/appointments/treatment added; nothing is duplicated.
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import pg from "pg";
import { seedTreatmentRecords } from "./seed-treatment-records.js";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const RESET = argv.includes("--reset");
const STAFF = {
  username: flag("staff-user", process.env.REVIEWER_STAFF_USER || "reviewer"),
  password: flag("staff-pass", process.env.REVIEWER_STAFF_PASS || "Review@2026"),
  fullname: "Play Reviewer (clinic staff)",
  mobile_number: "9000000001",
};
const PATIENT = {
  username: flag("patient-user", process.env.REVIEWER_PATIENT_USER || "reviewpatient"),
  password: flag("patient-pass", process.env.REVIEWER_PATIENT_PASS || "Review@2026"),
  fullname: "Play Reviewer (patient)",
  mobile_number: "9000000002",
};
for (const a of [STAFF, PATIENT]) {
  if (!/^[0-9A-Za-z]{3,16}$/.test(a.username)) throw new Error(`Username "${a.username}" must be 3-16 alphanumeric characters.`);
}

const uuid = () => crypto.randomUUID();
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromNow = (n, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const client = new pg.Client({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USERNAME,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

// Delete every row of every table whose `column` equals one of `ids`.
// Used by --reset so new tables that reference the reviewer rows are cleaned
// up without listing them here.
async function deleteWhere(column, ids, { except = [] } = {}) {
  if (!ids.length) return;
  const tables = (
    await q(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = $1 AND table_name <> ALL($2)`,
      [column, except],
    )
  ).map((r) => r.table_name);
  for (const t of tables) {
    const res = await client.query(`DELETE FROM ${t} WHERE ${column} = ANY($1::uuid[])`, [ids]);
    if (res.rowCount) console.log(`  ${t}: removed ${res.rowCount} (${column})`);
  }
}

async function upsertUser({ username, password, fullname, mobile_number }, role, practiceId) {
  const roleRow = await one(`SELECT id FROM roles WHERE key = $1 AND practice_id IS NULL AND is_system`, [role]);
  const hash = bcrypt.hashSync(password, 10);
  const existing = await one(`SELECT id, role FROM users WHERE username = $1`, [username]);
  if (existing && existing.role !== role) {
    throw new Error(`User "${username}" already exists with role "${existing.role}", not "${role}". Pick another username.`);
  }
  if (existing) {
    await q(
      `UPDATE users SET password = $2, is_active = true, deleted_at = NULL, practice_id = $3, role_id = $4,
              token_version = COALESCE(token_version, 0) + 1, updated_at = now()
        WHERE id = $1`,
      [existing.id, hash, practiceId, roleRow?.id ?? null],
    );
    console.log(`  ${role} user "${username}": password reset`);
    return existing.id;
  }
  const row = await one(
    `INSERT INTO users (id, fullname, country_code, mobile_number, email, username, password, is_active, role, gender,
                        practice_id, role_id, created_at, updated_at)
     VALUES ($1, $2, '91', $3, $4, $5, $6, true, $7, 'other', $8, $9, now(), now()) RETURNING id`,
    [uuid(), fullname, mobile_number, `${username}@example.com`, username, hash, role, practiceId, roleRow?.id ?? null],
  );
  console.log(`  ${role} user "${username}": created`);
  return row.id;
}

async function seedStaff(ctx) {
  const userId = await upsertUser(STAFF, "staff", ctx.practiceId);
  let staff = await one(`SELECT id FROM staffs WHERE user_id = $1`, [userId]);
  if (!staff) {
    staff = await one(
      `INSERT INTO staffs (id, doctor_id, user_id, practice_id, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id`,
      [uuid(), ctx.doctorId, userId, ctx.practiceId],
    );
  }
  const mapped = await one(`SELECT id FROM clinic_staff_mappings WHERE staff_id = $1 AND clinic_id = $2`, [staff.id, ctx.clinicId]);
  if (!mapped) {
    await q(`INSERT INTO clinic_staff_mappings (id, clinic_id, staff_id, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`, [
      uuid(),
      ctx.clinicId,
      staff.id,
    ]);
  }
  console.log(`  linked to clinic "${ctx.clinicName}" as staff`);
}

async function seedPatient(ctx) {
  const userId = await upsertUser(PATIENT, "patient", ctx.practiceId);
  let patient = await one(`SELECT id FROM patients WHERE user_id = $1`, [userId]);
  if (!patient) {
    patient = await one(
      `INSERT INTO patients (id, user_id, practice_id, blood_group, marital_status, source, created_at, updated_at)
       VALUES ($1, $2, $3, 'O+', 'single', 'app', now(), now()) RETURNING id`,
      [uuid(), userId, ctx.practiceId],
    );
  }
  const pid = patient.id;
  if (!(await one(`SELECT 1 FROM clinic_patient_mappings WHERE patient_id = $1 AND clinic_id = $2`, [pid, ctx.clinicId]))) {
    await q(`INSERT INTO clinic_patient_mappings (id, clinic_id, patient_id, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`, [uuid(), ctx.clinicId, pid]);
  }
  if (!(await one(`SELECT 1 FROM doctor_patient_mappings WHERE patient_id = $1 AND doctor_id = $2`, [pid, ctx.doctorId]))) {
    await q(`INSERT INTO doctor_patient_mappings (id, doctor_id, patient_id, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`, [uuid(), ctx.doctorId, pid]);
  }

  // One completed visit last week and one upcoming visit tomorrow, so both
  // the "upcoming" and "past" lists have something to show.
  const bookings = await q(`SELECT status FROM bookings WHERE patient_id = $1`, [pid]);
  const chair = await one(`SELECT id FROM chairs WHERE clinic_id = $1 AND archived_at IS NULL ORDER BY position, created_at LIMIT 1`, [ctx.clinicId]);
  const base = { doctor_id: ctx.doctorId, patient_id: pid, clinic_id: ctx.clinicId, practice_id: ctx.practiceId, chair_id: chair?.id ?? null };
  const rows = [];
  if (!bookings.some((b) => b.status === "completed")) {
    const start = daysFromNow(-7, 11, 0);
    rows.push({
      ...base,
      id: uuid(),
      date: ymd(start),
      slot: "11:00:00",
      status: "completed",
      checked_in_at: new Date(start.getTime() - 10 * 60000),
      seated_at: new Date(start.getTime() + 5 * 60000),
      finished_at: new Date(start.getTime() + 35 * 60000),
      created_at: daysFromNow(-9),
      updated_at: daysFromNow(-7),
    });
  }
  if (!bookings.some((b) => b.status === "pending")) {
    const start = daysFromNow(1, 10, 30);
    rows.push({ ...base, id: uuid(), date: ymd(start), slot: "10:30:00", status: "pending", created_at: new Date(), updated_at: new Date() });
  }
  for (const r of rows) {
    const cols = Object.keys(r);
    await client.query(`INSERT INTO bookings (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => r[c]));
  }
  if (rows.length) console.log(`  added ${rows.length} appointment(s)`);

  let treatment = await one(`SELECT id FROM treatments WHERE patient_id = $1 AND status = 'active'`, [pid]);
  if (!treatment) {
    const service = await one(`SELECT id FROM services ORDER BY created_at LIMIT 1`);
    if (!service) throw new Error("No services exist; add one before seeding the reviewer patient.");
    const completed = await one(`SELECT id FROM bookings WHERE patient_id = $1 AND status = 'completed' ORDER BY date DESC LIMIT 1`, [pid]);
    treatment = await one(
      `INSERT INTO treatments (id, clinic_id, patient_id, service_id, appointment_id, added_by, status, practice_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $8) RETURNING id`,
      [uuid(), ctx.clinicId, pid, service.id, completed?.id ?? null, ctx.doctorUserId, ctx.practiceId, daysFromNow(-7)],
    );
    console.log("  added an active treatment");
  }
  // Fills plan/visits/prescriptions/x-rays/vitals/reports/payment wherever a
  // section of an active treatment is still blank (ours included).
  await seedTreatmentRecords(client);
}

async function reset() {
  for (const [acct, role] of [
    [STAFF, "staff"],
    [PATIENT, "patient"],
  ]) {
    const user = await one(`SELECT id FROM users WHERE username = $1 AND role = $2`, [acct.username, role]);
    if (!user) {
      console.log(`${role} "${acct.username}": not found`);
      continue;
    }
    console.log(`Removing ${role} "${acct.username}"`);
    if (role === "patient") {
      const patients = (await q(`SELECT id FROM patients WHERE user_id = $1`, [user.id])).map((r) => r.id);
      const treatments = (await q(`SELECT id FROM treatments WHERE patient_id = ANY($1::uuid[])`, [patients])).map((r) => r.id);
      await deleteWhere("treatment_id", treatments);
      await q(`DELETE FROM demo_seed_rows WHERE row_id = ANY($1::uuid[])`, [treatments]);
      await deleteWhere("patient_id", patients);
      await q(`DELETE FROM patients WHERE id = ANY($1::uuid[])`, [patients]);
    } else {
      const staffs = (await q(`SELECT id FROM staffs WHERE user_id = $1`, [user.id])).map((r) => r.id);
      await deleteWhere("staff_id", staffs);
      await q(`DELETE FROM staffs WHERE id = ANY($1::uuid[])`, [staffs]);
    }
    await deleteWhere("user_id", [user.id], { except: ["patients", "staffs"] });
    await q(`DELETE FROM users WHERE id = $1`, [user.id]);
  }
}

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");
    if (RESET) {
      await reset();
      await client.query("COMMIT");
      return;
    }
    const practice = await one(`SELECT id, name, owner_user_id FROM practices ORDER BY created_at LIMIT 1`);
    const clinic = await one(`SELECT id, name, doctor_id, practice_id FROM clinics ORDER BY created_at LIMIT 1`);
    if (!practice || !clinic) throw new Error("Need at least one practice and one clinic before seeding reviewer accounts.");
    const doctor = await one(`SELECT id, user_id FROM doctors WHERE id = $1`, [clinic.doctor_id]);
    const ctx = { practiceId: clinic.practice_id, clinicId: clinic.id, clinicName: clinic.name, doctorId: doctor.id, doctorUserId: doctor.user_id };

    console.log(`Staff app reviewer`);
    await seedStaff(ctx);
    console.log(`Patient app reviewer`);
    await seedPatient(ctx);
    await client.query("COMMIT");

    console.log("\nReviewer sign-in details (role tab -> username / password):");
    console.log(`  Staff app   : Staff   -> ${STAFF.username} / ${STAFF.password}`);
    console.log(`  Patient app : patient -> ${PATIENT.username} / ${PATIENT.password}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
