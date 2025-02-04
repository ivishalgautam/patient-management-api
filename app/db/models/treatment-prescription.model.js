"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

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
        onDelete: "CASCADE",
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
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

  await TreatmentPrescriptionModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await TreatmentPrescriptionModel.create(
    {
      treatment_id: req.body.treatment_id,
      data: req.body.data,
      added_by: req.user_data.id,
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

const update = async (req, id) => {
  return await TreatmentPrescriptionModel.update(
    { data: req.body.data },
    {
      where: { id: req?.params?.id || id },
      raw: true,
    }
  );
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };
  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(`
      EXISTS (
        SELECT 1
      FROM jsonb_array_elements(prs.data) AS elem
      WHERE elem->>'medicine_name' ILIKE :q OR elem->>'notes' ILIKE :q
)`);
    queryParams.q = `%${q.trim()}%`;
  }
  let whereClause = "";
  if (whereConditions.length) {
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;
  }
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      prs.*,
      usr.fullname as added_by
    FROM ${constants.models.TREATMENT_PRESCRIPTION_TABLE} prs
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = prs.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = prs.added_by
    ${whereClause}
    ORDER BY prs.created_at desc
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
    COUNT(prs.id) OVER()::integer as total
    FROM ${constants.models.TREATMENT_PRESCRIPTION_TABLE} prs
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = prs.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = prs.added_by
    ${whereClause}
  `;

  const data = await TreatmentPrescriptionModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
      limit,
      offset,
    },
    raw: true,
  });

  const count = await TreatmentPrescriptionModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
    },
    raw: true,
  });

  return { prescriptions: data, total: count?.[0]?.total ?? 0 };
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
  update: update,
  getByTreatmentId: getByTreatmentId,
};
