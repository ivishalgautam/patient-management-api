"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import {
  createSlotSchema,
  updateSlotSchema,
} from "../../validation-schemas/slot.schema.js";
import moment from "moment";
import { createSlots } from "../../helpers/slot.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = createSlotSchema.parse(req.body);

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
  try {
    const validateData = updateSlotSchema.parse(req.body);

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
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
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
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.SlotModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Slot not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByClinicId = async (req, res) => {
  try {
    const record = await table.ClinicModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Clinic not found!" });
    }

    res.send({ status: true, data: await table.SlotModel.getByClinicId(req) });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.SlotModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

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
