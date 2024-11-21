"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let BookingModel = null;

const init = async (sequelize) => {
  BookingModel = sequelize.define(
    constants.models.BOOKING_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      doctor_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.DOCTOR_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
      patient_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.PATIENT_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.CLINIC_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      slot: {
        type: DataTypes.TIME,
        allowNull: false,
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await BookingModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  const data = await BookingModel.create(
    {
      doctor_id: req.body.doctor_id,
      patient_id: req.body.patient_id,
      clinic_id: req.body.clinic_id,
      date: req.body.date,
      slot: req.body.slot,
    },
    { transaction }
  );

  return data.dataValues;
};

const get = async (req) => {
  const { role, id } = req.user_data;
  const whereConditions = [];
  const queryParams = {};

  if (role === "doctor") {
    whereConditions.push(`dr.user_id = :userId`);
    queryParams.userId = id;
  }

  if (role === "patient") {
    whereConditions.push(`pt.user_id = :userId`);
    queryParams.userId = id;
  }

  let page = req.query.page ? Number(req.query.page) : 1;
  let limit = req.query.limit ? Number(req.query.limit) : null;
  let offset = (page - 1) * limit;

  let whereClause = "";

  if (whereConditions.length)
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      bk.*
    FROM ${constants.models.BOOKING_TABLE} bk
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = bk.patient_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = bk.doctor_id
    ${whereClause}
    ORDER BY bk.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
    COUNT(bk.id) OVER()::INTEGER total
    FROM ${constants.models.BOOKING_TABLE} bk
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = bk.patient_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = bk.doctor_id
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  const data = await BookingModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await BookingModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  return { bookings: data, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, id) => {
  return await BookingModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByClinicId = async (req, id) => {
  return await BookingModel.findOne({
    where: {
      clinic_id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByClinicAndSlot = async (req, clinic_id, slot) => {
  return await BookingModel.count({
    where: {
      clinic_id: req?.body?.clinic_id || clinic_id,
      slot: req?.body?.slot || slot,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await BookingModel.findByPk(req?.params?.id || id);
};

const getByDoctorId = async (doctor_id) => {
  return await PatientModel.findOne({
    where: {
      doctor_id: doctor_id,
    },
    raw: true,
  });
};

const update = async (req, id) => {
  const data = await BookingModel.update(
    {
      doctor_id: req.body.doctor_id,
      patient_id: req.body.patient_id,
      clinic_id: req.body.clinic_id,
      date: req.body.date,
      slot: req.body.slot,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      plain: true,
    }
  );

  return data[1];
};

const deleteById = async (req, id) => {
  return await BookingModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getByClinicId: getByClinicId,
  getByPk: getByPk,
  getByDoctorId: getByDoctorId,
  update: update,
  deleteById: deleteById,
  getByClinicAndSlot: getByClinicAndSlot,
};
