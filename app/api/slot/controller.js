"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import {
  createSlotSchema,
  updateSlotSchema,
} from "../../validation-schemas/slot.schema.js";
import { createSlots } from "../../helpers/slot.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const validateData = createSlotSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateData);

    const startTime = req.body.start_time;
    const endTime = req.body.end_time;
    const intervalInMinute = req.body.interval_in_minute;
    const slots = createSlots(startTime, endTime, intervalInMinute);
    req.body.slots = slots;

    const doctorRecord = await table.DoctorModel.getByUserId(req);
    if (!doctorRecord)
      return res
        .code(404)
        .send({ status: false, message: "Doctor not exist." });

    const clinicRecord = await table.ClinicModel.getById(0, req.body.clinic_id);
    if (!clinicRecord)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not exist." });

    const data = await table.SlotModel.create(req, doctorRecord.id, {
      transaction,
    });

    await transaction.commit();
    res.send({
      status: true,
      data: data,
      message: "Slot created successfully.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  const validateData = updateSlotSchema.parse(req.body);
  // Use the validated values (defaults, coercions) from here on.
  Object.assign(req.body, validateData);

  const record = await table.SlotModel.getById(req);
  if (!record)
    return res.code(404).send({ status: false, message: "Slot not found." });

  const startTime = req.body.start_time;
  const endTime = req.body.end_time;
  const intervalInMinute = req.body.interval_in_minute;
  const slots = createSlots(startTime, endTime, intervalInMinute);
  req.body.slots = slots;

  res.send({
    status: true,
    data: await table.SlotModel.update(req),
    message: "Slot updated.",
  });
};

const getBySlug = async (req, res) => {
  const record = await table.SlotModel.getBySlug(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Slot not found!" });
  }

  res.send({
    status: true,
    data: await table.SlotModel.getBySlug(req),
  });
};

const getById = async (req, res) => {
  const record = await table.SlotModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Slot not found!" });
  }

  res.send({ status: true, data: record });
};

const getByClinicId = async (req, res) => {
  const record = await table.ClinicModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Clinic not found!" });
  }

  res.send({ status: true, data: await table.SlotModel.getByClinicId(req) });
};

const get = async (req, res) => {
  const data = await table.SlotModel.get(req);
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.SlotModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Slot not found!" });

    await table.SlotModel.deleteById(req, req.params.id, { transaction });

    await transaction.commit();
    res.send({ status: true, message: "Slot deleted.", data: [] });
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
  getByClinicId: getByClinicId,
};
