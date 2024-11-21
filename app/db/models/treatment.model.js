"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let TreatmentModel = null;

const init = async (sequelize) => {
  TreatmentModel = sequelize.define(
    constants.models.TREATMENT_TABLE,
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
        onUpdate: "CASCADE",
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
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      procedure_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.PROCEDURE_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await TreatmentModel.sync({ alter: true });
};

const create = async (
  { patient_id, doctor_id, procedure_id },
  { transaction }
) => {
  return await TreatmentModel.create(
    {
      patient_id: patient_id,
      doctor_id: doctor_id,
      procedure_id: procedure_id,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await TreatmentModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await TreatmentModel.findByPk(req?.params?.id || id);
};

const getByDoctorId = async (doctor_id) => {
  return await TreatmentModel.findOne({
    where: {
      doctor_id: doctor_id,
    },
    raw: true,
  });
};

const deleteById = async (req, id) => {
  return await TreatmentModel.destroy({
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
  getByPk: getByPk,
  getByDoctorId: getByDoctorId,
  deleteById: deleteById,
};
