"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { deleteFile } from "../../helpers/file.js";
import {
  documentDoctorSchema,
  documentPatientSchema,
} from "../../validation-schemas/treatment.schema.js";
import { getItemsToDelete } from "../../helpers/filter.js";
import { cleanupFiles } from "../../helpers/cleanup-files.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id, role } = req.user_data;
    req.body.documents = req.filePaths;

    if (["doctor", "staff"].includes(role)) {
      const validateData = documentDoctorSchema.parse(req.body);
    }

    if (role === "patient") {
      const validateData = documentPatientSchema.parse(req.body);
      const patient = await table.PatientModel.getByUserId(id);

      if (!patient)
        return res
          .code(404)
          .send({ status: false, message: "Patient not found!" });

      req.body.patient_id = patient.id;
    }

    const patient = await table.PatientModel.getById(0, req.body.patient_id);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const data = await table.DocumentModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Document created.",
    });
  } catch (error) {
    await transaction.rollback();
    cleanupFiles(req.filePaths);
    throw error;
  }
};

const updateById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.DocumentModel.getById(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Document not found!" });
    }

    const existingGallery = record.documents;
    const updatedGallery = req.body.documents;
    req.body.documents = [...(req.filePaths ?? []), ...updatedGallery];

    const documentsToDelete = getItemsToDelete(existingGallery, updatedGallery);

    await table.DocumentModel.update(req, 0, { transaction });

    if (documentsToDelete.length) {
      await cleanupFiles(documentsToDelete);
    }

    await transaction.commit();
    res.send({
      status: true,
      message: "Document updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.DocumentModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Document not found!" });
    }

    res.send({
      status: true,
      data: await table.DocumentModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.DocumentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Document not found!" });
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
        .send({ status: false, message: "patient not found." });

    const record = await table.DocumentModel.getByPatientId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByTreatmentId = async (req, res) => {
  try {
    const treatment = await table.TreatmentModel.getById(req);
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "treatment not found." });

    const record = await table.DocumentModel.getByTreatmentId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const patient = await table.PatientModel.getByUserId(req.user_data.id);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const data = await table.DocumentModel.getByPatientId(req, patient.id);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.DocumentModel.getById(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Document not found!" });

    const isDeleted = await table.DocumentModel.deleteById(req, 0, {
      transaction,
    });

    if (isDeleted) {
      await cleanupFiles(record.documents);
    }

    await transaction.commit();
    res.send({ status: true, message: "Document deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  create: create,
  get: get,
  updateById: updateById,
  deleteById: deleteById,
  getBySlug: getBySlug,
  getById: getById,
  getByPatientId: getByPatientId,
  getByTreatmentId: getByTreatmentId,
};
