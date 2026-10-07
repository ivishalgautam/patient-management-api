"use strict";
import { beginTransaction } from "../../db/transaction.js";
import table from "../../db/models.js";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../db/postgres.js";
import { importPatients as importPatientRows } from "./import.service.js";
import { handleExcelImport } from "../../utils/import-excel.js";
import config from "../../config/index.js";

const get = async (req, res) => {
  res.send({ status: true, data: await table.PatientModel.get(req) });
};

// POST /patients/import (multipart: file, optional clinic_id).
// Clinic: the clinic_id field, else the caller's first clinic.
const importPatients = async (req, res) => {
  let rows = [];
  const fields = {};
  for await (const part of req.parts()) {
    if (part.file) rows = await handleExcelImport(part);
    else fields[part.fieldname] = part.value;
  }

  const clinicId = fields.clinic_id || config.clinic_id || null;
  const [clinic] = await sequelize.query(
    clinicId
      ? `SELECT id, practice_id FROM clinics WHERE id = :clinicId`
      : `SELECT id, practice_id FROM clinics WHERE practice_id = :practiceId ORDER BY created_at LIMIT 1`,
    {
      replacements: { clinicId, practiceId: req.ctx.practiceId },
      type: QueryTypes.SELECT,
    },
  );
  if (!clinic || (!req.ctx.isPlatformAdmin && clinic.practice_id !== req.ctx.practiceId)) {
    return res.code(404).send({ status: false, message: "Clinic not found." });
  }

  const transaction = await beginTransaction(req);
  const result = await importPatientRows(rows, {
    clinic,
    actor: { id: req.user_data.id },
    transaction,
  });
  await transaction.commit();
  return res.send({ status: true, success: true, data: result });
};

export default {
  get: get,
  importPatients: importPatients,
};
