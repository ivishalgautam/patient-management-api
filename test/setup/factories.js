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
