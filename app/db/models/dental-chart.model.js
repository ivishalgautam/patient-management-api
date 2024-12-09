"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let DentalChartModel = null;

const init = async (sequelize) => {
  DentalChartModel = sequelize.define(
    constants.models.DENTAL_CHART_TABLE,
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
      affected_tooths: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await DentalChartModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await DentalChartModel.create(
    {
      treatment_id: req.body.treatment_id,
      affected_tooths: req.body.affected_tooths,
    },
    { transaction }
  );
};

const get = async () => {
  return await DentalChartModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await DentalChartModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const updateById = async (req, id, { transaction }) => {
  return await DentalChartModel.update(
    {
      treatment_id: req.body.treatment_id,
      affected_tooths: req.body.affected_tooths,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      raw: true,
    },
    { transaction }
  );
};

const getByPk = async (req, id) => {
  return await DentalChartModel.findByPk(req?.params?.id || id);
};

const getByTreatmentId = async (req, treatment_id) => {
  return await DentalChartModel.findOne({
    where: {
      treatment_id: req?.params?.id || treatment_id,
    },
    raw: true,
  });
};

const deleteById = async (req, id) => {
  return await DentalChartModel.destroy({
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
  getByTreatmentId: getByTreatmentId,
  deleteById: deleteById,
  updateById: updateById,
};
