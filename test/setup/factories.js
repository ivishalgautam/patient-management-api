// Test data helpers. Admins and doctors are created directly in the DB
// (that is how they are bootstrapped today); everything else goes through
// the API so the tests exercise real endpoints.
import table from "../../app/db/models.js";

let counter = 0;
const unique = (prefix) => `${prefix}${Date.now().toString(36)}${counter++}`;

export async function createAdmin({ password = "Admin@123" } = {}) {
  const username = unique("adm");
  const user = await table.UserModel.create(
    {
      body: {
        username,
        password,
        fullname: "Test Admin",
        country_code: "91",
        mobile_number: "9000000001",
        role: "admin",
      },
    },
    { transaction: null },
  );
  return { user, username, password, role: "admin" };
}

export async function createDoctor({ password = "Doctor@123" } = {}) {
  const username = unique("doc");
  const user = await table.UserModel.create(
    {
      body: {
        username,
        password,
        fullname: "Dr Test",
        country_code: "91",
        mobile_number: "9000000002",
        role: "doctor",
      },
    },
    { transaction: null },
  );
  const doctor = await table.DoctorModel.create(
    { body: { specialization: "Dentist", experience_years: 5, about: "" } },
    user.id,
    { transaction: null },
  );
  return { user, doctor, username, password, role: "doctor" };
}

export async function login(app, { username, password, role }) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { username, password, role },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed for ${username}: ${res.body}`);
  }
  return res.json().token;
}

// Small wrapper: api(app, token).post("/v1/...", body)
export function api(app, token) {
  const call = (method) => (url, payload) =>
    app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  return {
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
  };
}

// Procedure + service in the public catalogue (admin-owned).
export async function createService(app, adminToken, name = unique("Svc ")) {
  const client = api(app, adminToken);
  const proc = await client.post("/v1/procedures", {
    name: unique("Proc "),
    image: "public/images/p.png",
  });
  if (proc.statusCode !== 200) throw new Error(`procedure: ${proc.body}`);
  const procedureId = (proc.json().data ?? {}).id;
  const svc = await client.post("/v1/services", {
    procedure_id: procedureId,
    name,
    image: "public/images/s.png",
  });
  if (svc.statusCode !== 200) throw new Error(`service: ${svc.body}`);
  return svc.json().data;
}

// A complete practice built through the API, the way the dashboard does it:
// admin + catalogue service, doctor with one clinic and slot template,
// one staff member mapped to the clinic and one patient.
export async function setupPractice(app, { maxPatientsPerSlot = 1 } = {}) {
  const { query } = await import("./db.js");
  const admin = await createAdmin();
  const adminToken = await login(app, admin);
  const service = await createService(app, adminToken);

  const doctor = await createDoctor();
  const doctorToken = await login(app, doctor);
  const asDoctor = api(app, doctorToken);

  const clinicRes = await asDoctor.post("/v1/clinics", {
    name: "Smile Clinic",
    address: "1 Main Road",
    max_patients_per_slot: maxPatientsPerSlot,
  });
  if (clinicRes.statusCode !== 200) throw new Error(`clinic: ${clinicRes.body}`);
  const clinic = clinicRes.json().data;

  const slotRes = await asDoctor.post("/v1/slots", {
    clinic_id: clinic.id,
    start_time: "09:00:00",
    end_time: "12:00:00",
    interval_in_minute: 30,
    days_off: [0],
  });
  if (slotRes.statusCode !== 200) throw new Error(`slot: ${slotRes.body}`);

  const staffUsername = unique("stf");
  const staffRes = await asDoctor.post("/v1/users", {
    role: "staff",
    username: staffUsername,
    password: "Staff@123",
    fullname: "Front Desk",
    country_code: "91",
    mobile_number: "9000000003",
  });
  if (staffRes.statusCode !== 200) throw new Error(`staff: ${staffRes.body}`);
  const staffUser = staffRes.json().user;
  const [staffRow] = await query(`SELECT id FROM staffs WHERE user_id = :id`, {
    id: staffUser.id,
  });
  const mapRes = await asDoctor.post("/v1/clinic-staff", {
    clinic_id: clinic.id,
    staff_id: staffRow.id,
  });
  if (mapRes.statusCode !== 200) throw new Error(`clinic-staff: ${mapRes.body}`);
  const staffToken = await login(app, {
    username: staffUsername,
    password: "Staff@123",
    role: "staff",
  });

  const patient = await createPatient(app, doctorToken);

  return {
    admin: { ...admin, token: adminToken },
    doctor: { ...doctor, token: doctorToken },
    staff: { user: staffUser, staffId: staffRow.id, token: staffToken },
    clinic,
    service,
    patient,
  };
}

export async function createPatient(app, token, overrides = {}) {
  const { query } = await import("./db.js");
  const mobile = overrides.mobile_number ?? `98${String(Date.now()).slice(-8)}`;
  const res = await api(app, token).post("/v1/users", {
    role: "patient",
    fullname: "Asha Patel",
    country_code: "91",
    mobile_number: mobile,
    gender: "female",
    ...overrides,
  });
  if (res.statusCode !== 200) throw new Error(`patient: ${res.body}`);
  const user = res.json().user;
  const [row] = await query(`SELECT id FROM patients WHERE user_id = :id`, {
    id: user.id,
  });
  return { user, id: row.id, mobile };
}

// Next date (YYYY-MM-DD) that is not a Sunday (day 0 is the slot day off).
export function nextWorkingDate(daysAhead = 2) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Builds a multipart/form-data payload for app.inject.
// files: [{ field, filename, contentType, content }]
export function multipart(fields = {}, files = []) {
  const boundary = `----test${Date.now().toString(16)}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  for (const f of files) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`,
    );
    chunks.push(Buffer.from(f.content));
    chunks.push("\r\n");
  }
  chunks.push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
