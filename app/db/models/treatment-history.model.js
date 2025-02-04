"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let TreatmentHistoryModel = null;

const init = async (sequelize) => {
  TreatmentHistoryModel = sequelize.define(
    constants.models.TREATMENT_HISTORY_TABLE,
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
      content: {
        type: DataTypes.TEXT,
        defaultValue: "",
      },
      files: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: [],
      },
      added_by: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.USER_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        validate: {
          isUUID: "4",
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await TreatmentHistoryModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await TreatmentHistoryModel.create(
    {
      treatment_id: req.body.treatment_id,
      content: req.body.content,
      files: req.body.files,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentHistoryModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await TreatmentHistoryModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const updateById = async (req, id) => {
  return await TreatmentHistoryModel.update(
    {
      content: req.body.content,
      files: req.body.files,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      raw: true,
    }
  );
};
const getByTreatmentId = async (req, treatment_id) => {
  return await TreatmentHistoryModel.findAll({
    where: {
      treatment_id: req?.params?.treatment_id || treatment_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await TreatmentHistoryModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id) => {
  return await TreatmentHistoryModel.destroy({
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
