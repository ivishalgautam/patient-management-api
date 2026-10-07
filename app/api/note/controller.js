"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { dentalNoteSchema } from "../../validation-schema/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = dentalNoteSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);
    const patient = await table.PatientModel.getById(0, req.body.patient_id);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const data = await table.NoteModel.create(req, { transaction });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Note created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const transaction = await beginTransaction(req);
  const record = await table.NoteModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Note not found!" });
  }

  res.send({
    status: true,
    data: await table.NoteModel.update(req, 0, { transaction }),
    message: "Note updated.",
  });
};

const getBySlug = async (req, res) => {
  const record = await table.NoteModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Note not found!" });
  }

  res.send({
    status: true,
    data: await table.NoteModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.NoteModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Note not found!" });
  }

  res.send({ status: true, data: record });
};

const getByPatientId = async (req, res) => {
  const patient = await table.PatientModel.getById(req);
  if (!patient)
    return res
      .code(404)
      .send({ status: false, message: "Patient not found." });

  const record = await table.NoteModel.getByPatientId(req);

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const data = await table.NoteModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.NoteModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Note not found!" });

    await table.NoteModel.deleteById(
      req,
      req.params.id,
      { transaction }
    );

    await transaction.commit();
    res.send({ status: true, message: "Note deleted." });
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
};
