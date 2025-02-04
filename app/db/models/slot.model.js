"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let SlotModel = null;

const init = async (sequelize) => {
  SlotModel = sequelize.define(
    constants.models.SLOT_TABLE,
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
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: { msg: "Slots exist for this clinic." },
        references: {
          model: constants.models.CLINIC_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
      start_time: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      end_time: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      interval_in_minute: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      slots: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
      },
      days_off: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        defaultValue: [],
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await SlotModel.sync({ alter: true });
};

const create = async (req, doctor_id, { transaction }) => {
  const data = await SlotModel.create(
    {
      slots: req.body.slots,
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      interval_in_minute: req.body.interval_in_minute,
      clinic_id: req.body.clinic_id,
      days_off: req.body.days_off,
      doctor_id: doctor_id,
    },
    { transaction }
  );

  return data.dataValues;
};

const get = async (req) => {
  let query = `
  SELECT
      slt.*
    FROM ${constants.models.SLOT_TABLE} slt
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = slt.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = dr.user_id
    WHERE usr.id = :userId
  `;

  return await SlotModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { userId: req.user_data.id },
  });
};

const getById = async (req, id) => {
  return await SlotModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByClinicId = async (req, id) => {
  return await SlotModel.findOne({
    where: {
      clinic_id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await SlotModel.findByPk(req?.params?.id || id);
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
  const data = await SlotModel.update(
    {
      slots: req.body.slots,
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      interval_in_minute: req.body.interval_in_minute,
      days_off: req.body.days_off,
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

const deleteById = async (req, id, { transaction }) => {
  return await SlotModel.destroy(
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      raw: true,
    },
    { transaction }
  );
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
};
