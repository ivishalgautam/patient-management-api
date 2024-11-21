"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let ClinicPatientMappingModel = null;

const init = async (sequelize) => {
  ClinicPatientMappingModel = sequelize.define(
    constants.models.CLINIC_PATIENT_TABLE,
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
        onDelete: "CASCADE",
        references: {
          model: constants.models.CLINIC_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
      },
      patient_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.PATIENT_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await ClinicPatientMappingModel.sync({ alter: true });
};

const create = async (patient_id, clinic_id, { transaction }) => {
  return await ClinicPatientMappingModel.create(
    {
      patient_id: patient_id,
      clinic_id: clinic_id,
    },
    { transaction }
  );
};

const get = async () => {
  return await ClinicPatientMappingModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await ClinicPatientMappingModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByClinicPatientId = async (patient_id, clinic_id) => {
  return await ClinicPatientMappingModel.findOne({
    where: {
      patient_id: patient_id,
      clinic_id: clinic_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await ClinicPatientMappingModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id) => {
  return await ClinicPatientMappingModel.destroy({
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
  getByClinicPatientId: getByClinicPatientId,
  getByPk: getByPk,
  deleteById: deleteById,
};
