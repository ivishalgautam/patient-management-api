"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let AppointmentModel = null;

const init = async (sequelize) => {
  AppointmentModel = sequelize.define(
    constants.models.APPOINTMENT_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
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
      service_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.SERVICE_TABLE,
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
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_canceled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await AppointmentModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await AppointmentModel.create(
    {
      clinic_id: req.body.clinic_id,
      patient_id: req.body.patient_id,
      service_id: req.body.service_id,
      date: req.body.date,
      slot: req.body.slot,
    },
    { transaction }
  );
};

const get = async () => {
  return await AppointmentModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await AppointmentModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByUserId = async (user_id) => {
  return await PatientModel.findOne({
    where: {
      user_id: user_id,
    },
    raw: true,
  });
};

const update = async (req, id) => {
  return await AppointmentModel.update(
    {},
    {
      where: {
        id: req?.params?.id || id,
      },
      plain: true,
    }
  );
};

const deleteById = async (req, id) => {
  return await AppointmentModel.destroy({
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
  getByUserId: getByUserId,
  update: update,
  deleteById: deleteById,
};
