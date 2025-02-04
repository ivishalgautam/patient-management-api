"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { comprehensiveExaminationSchema } from "../../validation-schemas/comprehensive-examination.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateHistoryData = comprehensiveExaminationSchema.parse(req.body);
    const patient = await table.PatientModel.getById(0, req.body.patient_id);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const data = await table.ComprehensiveExaminationModel.create(req, {
      transaction,
    });

    const treatment = await table.TreatmentModel.getByPatientId(
      0,
      req.body.patient_id
    );

    // req.body.treatment_id = treatment.id;
    // req.body.total_cost = 0;
    // await table.TreatmentPlanModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Comprehensive examination created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.ComprehensiveExaminationModel.getByPk(req);
    if (!record) {
      return res.code(NOT_FOUND).send({
        status: false,
        message: "Comprehensive examination not found!",
      });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByPatientId = async (req, res) => {
  try {
    const patient = await table.PatientModel.getById(req);
    console.log({ patient });
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const record =
      await table.ComprehensiveExaminationModel.getByPatientId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = sequelize.transaction();

  try {
    const record = await table.ComprehensiveExaminationModel.getByPk(req);
    if (!record)
      return res.code(NOT_FOUND).send({
        status: false,
        message: "Comprehensive examination not found!",
      });

    const isTreatmentDeleted =
      await table.ComprehensiveExaminationModel.deleteById(req, req.params.id, {
        transaction,
      });

    if (isTreatmentDeleted) {
      deleteFile(record?.image);
    }

    await transaction.commit();
    res.send({ status: true, message: "Comprehensive examination deleted." });
  } catch (error) {
    await (await transaction).rollback();
    throw error;
  }
};

export default {
  create: create,
  deleteById: deleteById,
  getById: getById,
  getByPatientId: getByPatientId,
};
