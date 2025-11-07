"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { createSlots } from "../../helpers/slot.js";
import { blockSlotSchema } from "../../validation-schemas/block-slot.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateData = blockSlotSchema.parse(req.body);

    const clinicRecord = await table.ClinicModel.getById(0, req.body.clinic_id);
    if (!clinicRecord)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not exist." });

    const slotRecord = await table.SlotModel.getByClinicId(
      0,
      req.body.clinic_id
    );
    if (!slotRecord)
      return res.code(400).send({
        status: false,
        message:
          "Slots does not exist for this clinic, Please create slots first.",
      });

    const record = await table.BlockedSlotModel.getByDateAndClinic(
      0,
      req.body.clinic_id,
      req.body.date
    );
    if (record) {
      const data = await table.BlockedSlotModel.update(req, record.id);
      return res.send({ status: true, data: data, message: "Updated." });
    }

    const data = await table.BlockedSlotModel.create(req, {
      transaction,
    });

    await transaction.commit();
    res.send({ status: true, data: data, message: "Created." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    const validateData = blockSlotSchema.parse(req.body);

    const record = await table.BlockedSlotModel.getById(req);
    if (!record)
      return res.code(404).send({ status: false, message: "Slot not found." });

    const startTime = req.body.start_time;
    const endTime = req.body.end_time;
    const intervalInMinute = req.body.interval_in_minute;
    const slots = createSlots(startTime, endTime, intervalInMinute);
    req.body.slots = slots;

    res.send({
      status: true,
      data: await table.BlockedSlotModel.update(req),
      message: "Slot updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.BlockedSlotModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Slot not found!" });
    }

    res.send({
      status: true,
      data: await table.BlockedSlotModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.BlockedSlotModel.getByPk(req);
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

const getByDateAndClinic = async (req, res) => {
  try {
    const clinicId = req?.query?.clinic;
    if (!clinicId) {
      return res
        .code(400)
        .send({ status: false, message: "Clinic ID is required!" });
    }

    const clinicRecord = await table.ClinicModel.getById(0, clinicId);
    if (!clinicRecord) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Clinic not found!" });
    }

    const [slotRecord, blockedSlots, bookedSlots] = await Promise.all([
      table.SlotModel.getByClinicId(0, clinicId),
      table.BlockedSlotModel.getByDateAndClinic(req),
      table.BookingModel.getByDateAndClinic(req),
    ]);

    const { slots = [] } = slotRecord || {};
    const maxPatientPerSlot = clinicRecord.max_patients_per_slot || 1;

    const bookedCountMap = bookedSlots.reduce((acc, { slot }) => {
      acc[slot] = (acc[slot] || 0) + 1;
      return acc;
    }, {});

    const fullyBookedSlots = slots.filter(
      (slot) => bookedCountMap[slot] >= maxPatientPerSlot
    );

    return res.send({
      status: true,
      data: blockedSlots ?? {},
      booked: fullyBookedSlots,
    });
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

    res.send({
      status: true,
      data: await table.BlockedSlotModel.getSlotsByClinicId(req),
    });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.BlockedSlotModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.BlockedSlotModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Slot not found!" });

    await table.BlockedSlotModel.deleteById(req, req.params.id, {
      transaction,
    });

    await transaction.commit();
    res.send({ status: true, message: "Slot deleted." });
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
  getByDateAndClinic: getByDateAndClinic,
};
