"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let TreatmentPrescriptionModel = null;

const init = async (sequelize) => {
  TreatmentPrescriptionModel = sequelize.define(
    constants.models.TREATMENT_PRESCRIPTION_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      treatment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.TREATMENT_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await TreatmentPrescriptionModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await TreatmentPrescriptionModel.create(
    {
      treatment_id: req.body.treatment_id,
      data: req.body.data,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentPrescriptionModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await TreatmentPrescriptionModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const updateById = async (req, id) => {
  return await TreatmentPrescriptionModel.update(
    { data: req.body.data },
    {
      where: { id: req?.params?.id || id },
      raw: true,
    }
  );
};
const getByTreatmentId = async (req, treatment_id) => {
  return await TreatmentPrescriptionModel.findAll({
    where: {
      treatment_id: req?.params?.treatment_id || treatment_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await TreatmentPrescriptionModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id) => {
  return await TreatmentPrescriptionModel.destroy({
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
  deleteById: deleteById,
  updateById: updateById,
  getByTreatmentId: getByTreatmentId,
};
