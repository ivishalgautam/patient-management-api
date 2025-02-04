"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let InvestigationModel = null;

const init = async (sequelize) => {
  InvestigationModel = sequelize.define(
    constants.models.INVESTIGATION_TABLE,
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
      temperature: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      weight: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      blood_pressure: {
        type: DataTypes.STRING,
        defaultValue: "",
      },
      oxygen_saturation: {
        type: DataTypes.STRING,
        defaultValue: "",
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

  await InvestigationModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await InvestigationModel.create(
    {
      treatment_id: req.body.treatment_id,
      temperature: req.body.temperature,
      weight: req.body.weight,
      blood_pressure: req.body.blood_pressure,
      oxygen_saturation: req.body.oxygen_saturation,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await InvestigationModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await InvestigationModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await InvestigationModel.update(
    {
      temperature: req.body.temperature,
      weight: req.body.weight,
      blood_pressure: req.body.blood_pressure,
      oxygen_saturation: req.body.oxygen_saturation,
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
  return await InvestigationModel.findByPk(req?.params?.id || id);
};

const getByTreatmentId = async (req, treatment_id) => {
  // const whereConditions = [`trmnt.id = :treatmentId`];
  // const queryParams = { treatmentId: treatment_id };

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      invt.*,
      usr.fullname as added_by
    FROM ${constants.models.INVESTIGATION_TABLE} invt
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = invt.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = invt.added_by
    WHERE trmnt.id = :treatmentId
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(invt.id) OVER()::integer as total
    FROM ${constants.models.INVESTIGATION_TABLE} invt
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = invt.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = invt.added_by
    WHERE trmnt.id = :treatmentId
    LIMIT :limit OFFSET :offset
  `;

  const data = await InvestigationModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: req.params.id || treatment_id, limit, offset },
    raw: true,
  });

  const count = await InvestigationModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: req.params.id || treatment_id, limit, offset },
    raw: true,
  });

  return { investigations: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await InvestigationModel.destroy({
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
  update: update,
};
