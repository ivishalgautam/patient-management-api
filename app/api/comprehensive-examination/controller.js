"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { comprehensiveExaminationSchema } from "../../validation-schemas/comprehensive-examination.schema.js";
import { cleanupFiles } from "../../helpers/cleanup-files.js";
import { getItemsToDelete } from "../../helpers/filter.js";

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
      req,
      req.body.patient_id
    );
    // console.log(treatment.treatments);
    req.body.treatment_id = treatment.treatments[0].id;
    req.body.total_cost = 0;
    await table.TreatmentPlanModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Comprehensive examination created.",
    });
  } catch (error) {
    await transaction.rollback();
    await cleanupFiles(req.filePaths);
    throw error;
  }
};

const createMultipart = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    req.body.gallery = req.filePaths;
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

    req.body.treatment_id = treatment.treatments[0].id;
    req.body.total_cost = 0;
    await table.TreatmentPlanModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Comprehensive examination created.",
    });
  } catch (error) {
    await transaction.rollback();
    await cleanupFiles(req.filePaths);
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.ComprehensiveExaminationModel.getById(req);
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
  const transaction = await sequelize.transaction();

  try {
    const record = await table.ComprehensiveExaminationModel.getById(req);
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
      cleanupFiles(record?.gallery);
    }

    await transaction.commit();
    res.send({ status: true, message: "Comprehensive examination deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const update = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.ComprehensiveExaminationModel.getById(req);
    if (!record)
      return res.code(NOT_FOUND).send({
        status: false,
        message: "Comprehensive examination not found!",
      });

    await table.ComprehensiveExaminationModel.update(req, 0, {
      transaction,
    });

    await transaction.commit();
    res.send({ status: true, message: "Comprehensive examination updated." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateMultipart = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.ComprehensiveExaminationModel.getById(req);

    if (!record)
      return res.code(NOT_FOUND).send({
        status: false,
        message: "Comprehensive examination not found!",
      });

    const existingGallery = record.gallery;
    const updatedGallery = req.body.gallery;
    const documentsToDelete = getItemsToDelete(existingGallery, updatedGallery);

    req.body.gallery = [...(req.filePaths ?? []), ...updatedGallery];
    await table.ComprehensiveExaminationModel.update(req, 0, {
      transaction,
    });

    if (documentsToDelete.length) {
      await cleanupFiles(documentsToDelete);
    }

    await transaction.commit();
    res.send({ status: true, message: "Comprehensive examination updated." });
  } catch (error) {
    await transaction.rollback();
    await cleanupFiles(req.filePaths);
    throw error;
  }
};

export default {
  create: create,
  createMultipart: createMultipart,
  deleteById: deleteById,
  getById: getById,
  getByPatientId: getByPatientId,
  update: update,
  updateMultipart: updateMultipart,
};
