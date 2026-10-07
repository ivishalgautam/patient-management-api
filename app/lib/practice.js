"use strict";
import { QueryTypes } from "sequelize";
import { sequelize } from "../db/postgres.js";
import { badRequest } from "./app-error.js";

const one = async (sql, replacements) =>
  (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];

// Practice for a new patient: the creator's practice, else the clinic's,
// else the only practice that exists (single-practice installs, public
// self-registration).
export async function resolvePracticeForPatient({ practiceId, clinicId, transaction } = {}) {
  if (practiceId) return practiceId;
  if (clinicId) {
    const clinic = await one(`SELECT practice_id FROM clinics WHERE id = :clinicId`, { clinicId });
    if (clinic) return clinic.practice_id;
  }
  const rows = await sequelize.query(`SELECT id FROM practices LIMIT 2`, {
    type: QueryTypes.SELECT,
    transaction,
  });
  if (rows.length === 1) return rows[0].id;
  throw badRequest("clinic_id is required to register a patient.");
}

export default { resolvePracticeForPatient };
