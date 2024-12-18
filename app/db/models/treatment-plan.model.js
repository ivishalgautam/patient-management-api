"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let TreatmentPlanModel = null;

const init = async (sequelize) => {
  TreatmentPlanModel = sequelize.define(
    constants.models.TREATMENT_PLAN_TABLE,
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
      status: {
        type: DataTypes.ENUM({ values: ["pending", "completed"] }),
        defaultValue: "pending",
        validate: {
          isIn: [["pending", "completed"]],
        },
      },
      total_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        defaultValue: "",
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await TreatmentPlanModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await TreatmentPlanModel.create(
    {
      treatment_id: req.body.treatment_id,
      status: req.body.status,
      total_cost: req.body.total_cost,
      notes: req.body.notes,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentPlanModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await TreatmentPlanModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await TreatmentPlanModel.update(
    {
      status: req.body.status,
      total_cost: req.body.total_cost,
      notes: req.body.notes,
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
  return await TreatmentPlanModel.findByPk(req?.params?.id || id);
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(`(srvc.name ILIKE :query OR tp.notes ILIKE :query)`);
    queryParams.query = `%${q}%`;
  }

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      tp.*,
      srvc.name as treatment_name
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(tp.id) OVER()::integer as total
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    ${whereClause}
  `;

  const data = await TreatmentPlanModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await TreatmentPlanModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { plans: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await TreatmentPlanModel.destroy({
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
