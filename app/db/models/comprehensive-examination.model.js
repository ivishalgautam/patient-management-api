"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let ComprehensiveExaminationModel = null;

const init = async (sequelize) => {
  ComprehensiveExaminationModel = sequelize.define(
    constants.models.COMPREHENSIVE_EXAMINATION_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
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
      chief_complaint: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      medical_history: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      dental_history: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      examination: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      // affected_tooths: {
      //   type: DataTypes.JSONB,
      //   allowNull: false,
      //   defaultValue: [],
      // },
      gallery: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
      },
      added_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.USER_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await ComprehensiveExaminationModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await ComprehensiveExaminationModel.create(
    {
      patient_id: req.body.patient_id,
      chief_complaint: req.body.chief_complaint,
      medical_history: req.body.medical_history,
      dental_history: req.body.dental_history,
      examination: req.body.examination,
      affected_tooths: req.body.affected_tooths,
      gallery: req.body.gallery,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const getById = async (req, id) => {
  return await ComprehensiveExaminationModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  const [, rows] = await ComprehensiveExaminationModel.update(
    {
      chief_complaint: req.body.chief_complaint,
      medical_history: req.body.medical_history,
      dental_history: req.body.dental_history,
      examination: req.body.examination,
      affected_tooths: req.body.affected_tooths,
      gallery: req.body.gallery,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      transaction,
    }
  );

  return rows;
};

const getByPatientId = async (req, patient_id) => {
  let query = `
  SELECT
      ce.*
    FROM ${constants.models.COMPREHENSIVE_EXAMINATION_TABLE} ce
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = ce.patient_id
    WHERE pt.id = :patientId
    LIMIT 1
  `;

  return await ComprehensiveExaminationModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { patientId: req?.params?.id || patient_id },
    raw: true,
    plain: true,
  });
};

const get = async (patient_id) => {
  console.log({ patient_id });
  let query = `
  SELECT
      ce.*
    FROM ${constants.models.COMPREHENSIVE_EXAMINATION_TABLE} ce
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = ce.patient_id
    WHERE pt.id = :patientId
    LIMIT 1
  `;

  return await ComprehensiveExaminationModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { patientId: patient_id },
    raw: true,
    plain: true,
  });
};

const deleteById = async (req, id) => {
  return await ComprehensiveExaminationModel.destroy({
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
  getById: getById,
  get: get,
  getByPatientId: getByPatientId,
  deleteById: deleteById,
  update: update,
};
