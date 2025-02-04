"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let XrayModel = null;

const init = async (sequelize) => {
  XrayModel = sequelize.define(
    constants.models.XRAY_TABLE,
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
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      files: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        validate: {
          notEmptyArr(arr) {
            if (!arr.length || arr.some((f) => f === "")) {
              throw new Error("files can't be null");
            }
          },
        },
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

  await XrayModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await XrayModel.create(
    {
      treatment_id: req.body.treatment_id,
      title: req.body.title,
      files: req.body.files,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await XrayModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await XrayModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await XrayModel.update(
    {
      title: req.body.title,
      files: req.body.files,
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
  return await XrayModel.findByPk(req?.params?.id || id);
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(
      `(prd.name ILIKE :query OR xr.title ILIKE :query OR usr.fullname ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      xr.*,
      prd.name as procedure_name,
      usr.fullname as added_by
    FROM ${constants.models.XRAY_TABLE} xr
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = xr.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = xr.added_by
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(xr.id) OVER()::integer as total
    FROM ${constants.models.XRAY_TABLE} xr
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = xr.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = xr.added_by
    ${whereClause}
  `;

  const data = await XrayModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await XrayModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { xrays: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await XrayModel.destroy({
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
