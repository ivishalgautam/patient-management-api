import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildTestApp } from "../setup/app.js";
import { resetDb } from "../setup/db.js";
import { setupPractice, api } from "../setup/factories.js";

let app;
let p;
let doctor;
beforeAll(async () => {
  app = await buildTestApp();
  await resetDb();
  p = await setupPractice(app);
  doctor = api(app, p.doctor.token);
});
afterAll(() => app.close());

const data = (res) => {
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json().data;
};

describe("pipelines", () => {
  it("every practice starts with the dental default pipeline", async () => {
    const [pipeline] = data(await doctor.get("/v1/pipelines"));
    expect(pipeline.name).toBe("New Patient Enquiries");
    expect(pipeline.is_default).toBe(true);
    expect(pipeline.stages.map((s) => s.name)).toEqual([
      "New Enquiry",
      "Contacted",
      "Consultation Booked",
      "Treatment Plan Shared",
      "Won - Treatment Started",
      "Lost",
    ]);
    expect(pipeline.stages.map((s) => s.stage_type)).toEqual(["open", "open", "open", "open", "won", "lost"]);
  });

  it("creates a pipeline with default or custom stages", async () => {
    const def = data(await doctor.post("/v1/pipelines", { name: "Implant Campaign" }));
    const full = data(await doctor.get(`/v1/pipelines/${def.id}`));
    expect(full.stages).toHaveLength(6);

    const custom = data(
      await doctor.post("/v1/pipelines", {
        name: "Braces",
        clinic_id: p.clinic.id,
        stages: [{ name: "New" }, { name: "Fitted", stage_type: "won", color: "#16a34a", probability: 100 }],
      }),
    );
    const braces = data(await doctor.get(`/v1/pipelines/${custom.id}`));
    expect(braces.clinic_id).toBe(p.clinic.id);
    expect(braces.stages.map((s) => [s.name, s.stage_type, s.probability])).toEqual([
      ["New", "open", 0],
      ["Fitted", "won", 100],
    ]);
  });

  it("keeps exactly one default and won't archive it", async () => {
    const pipelines = data(await doctor.get("/v1/pipelines"));
    const current = pipelines.find((x) => x.is_default);
    const other = pipelines.find((x) => !x.is_default);

    expect((await doctor.post(`/v1/pipelines/${current.id}/archive`)).statusCode).toBe(409);
    data(await doctor.post(`/v1/pipelines/${other.id}/default`));
    const after = data(await doctor.get("/v1/pipelines"));
    expect(after.filter((x) => x.is_default).map((x) => x.id)).toEqual([other.id]);

    data(await doctor.post(`/v1/pipelines/${current.id}/archive`));
    expect(data(await doctor.get("/v1/pipelines")).some((x) => x.id === current.id)).toBe(false);
    expect(data(await doctor.get("/v1/pipelines?include_archived=true")).some((x) => x.id === current.id)).toBe(true);
    expect((await doctor.post(`/v1/pipelines/${current.id}/default`)).statusCode).toBe(409);
    data(await doctor.post(`/v1/pipelines/${current.id}/unarchive`));
  });

  it("renames, and deletes a pipeline that never had leads", async () => {
    const created = data(await doctor.post("/v1/pipelines", { name: "Temp" }));
    expect(data(await doctor.put(`/v1/pipelines/${created.id}`, { name: "Temp 2" })).name).toBe("Temp 2");
    data(await doctor.delete(`/v1/pipelines/${created.id}`));
    expect((await doctor.get(`/v1/pipelines/${created.id}`)).statusCode).toBe(404);
  });

  it("sets the round-robin members (staff only)", async () => {
    const [pipeline] = data(await doctor.get("/v1/pipelines"));
    data(await doctor.put(`/v1/pipelines/${pipeline.id}/members`, { user_ids: [p.staff.user.id, p.doctor.user.id] }));
    expect(data(await doctor.get(`/v1/pipelines/${pipeline.id}`)).members).toHaveLength(2);
    const bad = await doctor.put(`/v1/pipelines/${pipeline.id}/members`, { user_ids: [p.patient.user.id] });
    expect(bad.statusCode).toBe(400);
  });
});

describe("stages", () => {
  let pipeline;
  beforeAll(async () => {
    pipeline = data(await doctor.post("/v1/pipelines", { name: "Stage Lab", stages: [{ name: "A" }, { name: "B" }] }));
  });

  it("adds, edits and validates required fields", async () => {
    const c = data(await doctor.post(`/v1/pipelines/${pipeline.id}/stages`, { name: "C", color: "#ff0000" }));
    expect(c.position).toBe(2);
    const updated = data(
      await doctor.put(`/v1/pipeline-stages/${c.id}`, { probability: 60, required_fields: ["phone", "cf:interest"] }),
    );
    expect(updated.required_fields).toEqual(["phone", "cf:interest"]);
    const bad = await doctor.put(`/v1/pipeline-stages/${c.id}`, { required_fields: ["cf:nope"] });
    expect(bad.statusCode).toBe(400);
    const badColor = await doctor.put(`/v1/pipeline-stages/${c.id}`, { color: "red" });
    expect(badColor.statusCode).toBe(400);
  });

  it("reorders stages (all stages required)", async () => {
    const stages = data(await doctor.get(`/v1/pipelines/${pipeline.id}`)).stages;
    const reversed = stages.map((s) => s.id).reverse();
    expect((await doctor.put(`/v1/pipelines/${pipeline.id}/stages/reorder`, { stage_ids: reversed.slice(1) })).statusCode).toBe(400);
    data(await doctor.put(`/v1/pipelines/${pipeline.id}/stages/reorder`, { stage_ids: reversed }));
    const after = data(await doctor.get(`/v1/pipelines/${pipeline.id}`)).stages;
    expect(after.map((s) => s.id)).toEqual(reversed);
    expect(after.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("deletes an empty stage, closes the gap, keeps at least one", async () => {
    let stages = data(await doctor.get(`/v1/pipelines/${pipeline.id}`)).stages;
    data(await doctor.delete(`/v1/pipeline-stages/${stages[0].id}`));
    stages = data(await doctor.get(`/v1/pipelines/${pipeline.id}`)).stages;
    expect(stages.map((s) => s.position)).toEqual([0, 1]);
    data(await doctor.delete(`/v1/pipeline-stages/${stages[0].id}`));
    const last = data(await doctor.get(`/v1/pipelines/${pipeline.id}`)).stages[0];
    expect((await doctor.delete(`/v1/pipeline-stages/${last.id}`)).statusCode).toBe(409);
  });
});

describe("custom fields", () => {
  it("includes the dental defaults", async () => {
    const fields = data(await doctor.get("/v1/custom-fields"));
    const interest = fields.find((f) => f.key === "interest");
    expect(interest.field_type).toBe("multi_select");
    expect(interest.options).toContain("Implants");
    expect(interest.options).toContain("Braces / Aligners");
  });

  it("creates fields of every type with a derived key", async () => {
    const types = ["text", "textarea", "number", "date", "checkbox", "phone", "email", "url"];
    for (const type of types) {
      const f = data(await doctor.post("/v1/custom-fields", { label: `My ${type} field`, field_type: type }));
      expect(f.key).toBe(`my_${type}_field`);
    }
    const dd = data(
      await doctor.post("/v1/custom-fields", { label: "Insurance", field_type: "dropdown", options: ["Yes", "No"] }),
    );
    expect(dd.options).toEqual(["Yes", "No"]);
  });

  it("rejects duplicates and option-less dropdowns", async () => {
    expect((await doctor.post("/v1/custom-fields", { label: "Insurance", field_type: "text" })).statusCode).toBe(409);
    expect((await doctor.post("/v1/custom-fields", { label: "Pick", field_type: "multi_select" })).statusCode).toBe(400);
  });

  it("edits, archives and restores", async () => {
    const f = data(await doctor.post("/v1/custom-fields", { label: "Budget", field_type: "number" }));
    expect(data(await doctor.put(`/v1/custom-fields/${f.id}`, { label: "Budget (INR)", is_filterable: true })).label).toBe(
      "Budget (INR)",
    );
    data(await doctor.post(`/v1/custom-fields/${f.id}/archive`));
    expect(data(await doctor.get("/v1/custom-fields")).some((x) => x.id === f.id)).toBe(false);
    data(await doctor.post(`/v1/custom-fields/${f.id}/unarchive`));
    expect(data(await doctor.get("/v1/custom-fields")).some((x) => x.id === f.id)).toBe(true);
  });
});

describe("tags", () => {
  it("creates (case-insensitive unique) and deletes", async () => {
    const tag = data(await doctor.post("/v1/tags", { name: "VIP", color: "#f59e0b" }));
    expect((await doctor.post("/v1/tags", { name: "vip" })).statusCode).toBe(409);
    expect(data(await doctor.get("/v1/tags")).map((t) => t.name)).toContain("VIP");
    data(await doctor.delete(`/v1/tags/${tag.id}`));
  });
});

describe("permissions", () => {
  it("staff see pipelines but can't configure them", async () => {
    const staff = api(app, p.staff.token);
    expect((await staff.get("/v1/pipelines")).statusCode).toBe(200);
    expect((await staff.post("/v1/pipelines", { name: "Nope" })).statusCode).toBe(403);
    expect((await staff.post("/v1/custom-fields", { label: "Nope", field_type: "text" })).statusCode).toBe(403);
  });
});

describe("pipeline lost reasons", () => {
  it("come with every pipeline and can be edited", async () => {
    const [first] = (await doctor.get("/v1/pipelines")).json().data;
    expect(first.lost_reasons).toContain("Too expensive");
    expect(typeof first.lead_count).toBe("number");
    const res = await doctor.put(`/v1/pipelines/${first.id}`, { lost_reasons: ["Too far away", "Too expensive"] });
    expect(res.statusCode).toBe(200);
    const [after] = (await doctor.get("/v1/pipelines")).json().data;
    expect(after.lost_reasons).toEqual(["Too far away", "Too expensive"]);
    const created = (await doctor.post("/v1/pipelines", { name: "Reasons default" })).json().data;
    expect(created.lost_reasons.length).toBeGreaterThan(3);
  });
});
