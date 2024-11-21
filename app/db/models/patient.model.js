"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let PatientModel = null;

const init = async (sequelize) => {
  PatientModel = sequelize.define(
    constants.models.PATIENT_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.USER_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
      },
      blood_group: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      marital_status: {
        type: DataTypes.ENUM({ values: ["single", "married", ""] }),
        allowNull: true,
        defaultValue: "",
      },
      height_in_cm: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      emergency_contact: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      source: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await PatientModel.sync({ alter: true });
};

const create = async (req, user_id, { transaction }) => {
  return await PatientModel.create(
    {
      user_id: user_id,
      blood_group: req.body.blood_group,
      marital_status: req.body.marital_status,
      height_in_cm: req.body.height_in_cm,
      emergency_contact: req.body.emergency_contact,
      source: req.body.source,
    },
    { transaction }
  );
};

const get = async () => {
  return await PatientModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await PatientModel.findOne({
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
  return await PatientModel.update(
    {
      blood_group: req.body.blood_group,
      marital_status: req.body.marital_status,
      height_in_cm: req.body.height_in_cm,
      emergency_contact: req.body.emergency_contact,
      source: req.body.source,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      plain: true,
    }
  );
};

const deleteById = async (req, id) => {
  return await PatientModel.destroy({
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
