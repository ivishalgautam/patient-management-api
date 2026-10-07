"use strict";
import slugify from "slugify";
import { QueryTypes } from "sequelize";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { badRequest } from "../../lib/app-error.js";
import { patientPassword } from "../../helpers/credential-generator.js";

// Excel rows: a row with patient_id starts a patient; following rows without
// patient_id are more treatments for that patient.
//   patient_id | fullname | mobile_number | gender (m/f) | date | treatment | cost
export function groupRows(rows) {
  const patients = [];
  for (const row of rows) {
    const treatment = { date: row.date, treatment: row.treatment, cost: row.cost };
    if (row.patient_id) {
      patients.push({
        patientNumber: String(row.patient_id).trim(),
        fullname: String(row.fullname ?? "").trim(),
        mobile: String(row.mobile_number ?? "").trim(),
        gender: String(row.gender ?? "").toLowerCase() === "f" ? "female" : "male",
        treatments: [treatment],
      });
    } else if (patients.length) {
      patients.at(-1).treatments.push(treatment);
    }
  }
  return patients;
}

const slugOf = (name) => slugify(String(name ?? "").trim(), { lower: true, strict: true });

// Resolves every treatment name to a catalogue service up front, so a typo
// rejects the file before anything is written.
async function resolveServices(patients) {
  const names = [...new Set(patients.flatMap((p) => p.treatments.map((t) => t.treatment)))];
  const bySlug = new Map();
  const missing = [];
  for (const name of names) {
    const service = await table.ServiceModel.getBySlug(0, slugOf(name));
    if (service) bySlug.set(slugOf(name), service);
    else missing.push(name);
  }
  if (missing.length) throw badRequest(`Service not found: ${missing.join(", ")}`);
  return bySlug;
}

async function importTreatments(patientId, treatments, { clinicId, actor, services, transaction }) {
  for (const row of treatments.filter((t) => t.treatment)) {
    const service = services.get(slugOf(row.treatment));
    const cost = Number(row.cost) || 0;
    const treatment = await table.TreatmentModel.create(
      { user_data: actor },
      { clinic_id: clinicId, patient_id: patientId, service_id: service.id },
      { transaction },
    );
    // Historic treatments are finished.
    await sequelize.query(`UPDATE treatments SET status = 'close' WHERE id = :id`, {
      replacements: { id: treatment.id },
      transaction,
    });
    await table.TreatmentPlanModel.create(
      {
        user_data: actor,
        body: { treatment_id: treatment.id, patient_id: patientId, affected_tooths: [], total_cost: cost },
      },
      { transaction },
    );
    if (cost > 0) {
      await table.TreatmentPaymentModel.create(
        {
          user_data: actor,
          body: {
            treatment_id: treatment.id,
            payment_type: "full",
            payment_method: "cash",
            amount_paid: cost,
          },
        },
        { transaction },
      );
    }
  }
}

async function findOrCreatePatient(p, { practiceId, transaction }) {
  const username = `ddss${p.patientNumber}`;
  let user = await table.UserModel.getByUsername({ body: { username } });
  if (!user) {
    user = await table.UserModel.create(
      {
        body: {
          username,
          password: patientPassword(p.fullname, p.mobile),
          fullname: p.fullname,
          country_code: "91",
          mobile_number: p.mobile,
          gender: p.gender,
          role: "patient",
        },
      },
      { transaction },
    );
  }
  const existing = await sequelize.query(`SELECT id FROM patients WHERE user_id = :id`, {
    replacements: { id: user.id },
    type: QueryTypes.SELECT,
    transaction,
  });
  if (existing[0]) return existing[0].id;
  const patient = await table.PatientModel.create({ body: {} }, user.id, { transaction, practiceId });
  return patient.id;
}

export async function importPatients(rows, { clinic, actor, transaction }) {
  const patients = groupRows(rows);
  const services = await resolveServices(patients);
  let created = 0;

  for (const p of patients) {
    const patientId = await findOrCreatePatient(p, { practiceId: clinic.practice_id, transaction });
    const mapped = await table.ClinicPatientMapModel.getByClinicPatientId(patientId, clinic.id);
    if (!mapped) {
      await table.ClinicPatientMapModel.create(patientId, clinic.id, { transaction });
    }
    await importTreatments(patientId, p.treatments, {
      clinicId: clinic.id,
      actor,
      services,
      transaction,
    });
    created++;
  }
  return { patients: created };
}

export default { importPatients, groupRows };
