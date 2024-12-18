"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let DentalNoteModel = null;

const init = async (sequelize) => {
  DentalNoteModel = sequelize.define(
    constants.models.DENTAL_NOTE_TABLE,
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
      affected_tooth: {
        type: DataTypes.STRING,
        allowNull: false,
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

  await DentalNoteModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await DentalNoteModel.create(
    {
      treatment_id: req.body.treatment_id,
      affected_tooth: req.body.affected_tooth,
      total_cost: req.body.total_cost,
      notes: req.body.notes,
    },
    { transaction }
  );
};

const get = async () => {
  return await DentalNoteModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await DentalNoteModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await DentalNoteModel.update(
    {
      affected_tooth: req.body.affected_tooth,
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
  return await DentalNoteModel.findByPk(req?.params?.id || id);
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(`(PRD.name ILIKE :query OR dn.notes ILIKE :query)`);
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      dn.*,
      prd.name as procedure_name
    FROM ${constants.models.DENTAL_NOTE_TABLE} dn
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = dn.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(dn.id) OVER()::integer as total
    FROM ${constants.models.DENTAL_NOTE_TABLE} dn
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = dn.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    ${whereClause}
  `;

  const data = await DentalNoteModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await DentalNoteModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { notes: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await DentalNoteModel.destroy({
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
