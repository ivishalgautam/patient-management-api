"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let ServiceModel = null;

const init = async (sequelize) => {
  ServiceModel = sequelize.define(
    constants.models.SERVICE_TABLE,
    {
      id: {
        primaryKey: true,
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      procedure_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.PROCEDURE_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        validate: {
          isUUID: 4,
        },
      },
      actual_price: {
        type: DataTypes.DOUBLE(),
        defaultValue: 0.0,
      },
      discounted_price: {
        type: DataTypes.DOUBLE(),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      image: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: {
          msg: "Service exist with this name!",
        },
      },
      is_featured: { type: DataTypes.BOOLEAN, defaultValue: false },
      main_points: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
      custom_points: {
        type: DataTypes.JSONB, // [{ heading: "", points: [] }]
        defaultValue: [],
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await ServiceModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  const category = await ServiceModel.create(
    {
      name: req.body.name,
      image: req.body.image,
      slug: req.body.slug,
      procedure_id: req.body.procedure_id,
      actual_price: req.body.actual_price,
      discounted_price: req.body.discounted_price,
      is_featured: req.body.is_featured,
      main_points: req.body.main_points,
      custom_points: req.body.custom_points,
    },
    {
      transaction,
    }
  );

  return category.dataValues;
};

const get = async (req) => {
  let whereConditions = [];
  const queryParams = {};
  let q = req.query.q;
  const featured = req.query.featured;

  if (q) {
    whereConditions.push(`srvc.name ILIKE :query OR prcd.name ILIKE :query`);
    queryParams.query = `%${q}%`;
  }

  if (featured) {
    whereConditions.push(`srvc.is_featured = true`);
  }

  const limit = req.query.limit ? Number(req.query.limit) : null;
  const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : 1;
  const offset = (page - 1) * limit;

  let whereClause = "";
  if (whereConditions.length > 0) {
    whereClause = "WHERE " + whereConditions.join(" AND ");
  }

  let query = `
  SELECT
      srvc.id, srvc.name, srvc.image, srvc.slug, srvc.created_at,
      prcd.name as procedure_name
    FROM ${constants.models.SERVICE_TABLE} srvc
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prcd ON prcd.id = srvc.procedure_id
    ${whereClause}
    ORDER BY srvc.name DESC
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(srvc.id) OVER()::integer as total
    FROM ${constants.models.SERVICE_TABLE} srvc
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prcd ON prcd.id = srvc.procedure_id
    ${whereClause}
    ORDER BY srvc.name DESC
    LIMIT :limit OFFSET :offset
  `;

  const data = await ServiceModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await ServiceModel.sequelize.query(countQuery, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { services: data, total: count?.[0]?.total ?? 0 };
};

const getByProcedureId = async (req, procedure_id) => {
  let whereConditions = [
    `srvc.procedure_id = '${req?.params?.id || procedure_id}'`,
  ];
  const queryParams = {};
  let q = req.query.q;
  const featured = req.query.featured;

  if (q) {
    whereConditions.push(`(srvc.name ILIKE :query OR prcd.name ILIKE :query)`);
    queryParams.query = `%${q}%`;
  }

  if (featured) {
    whereConditions.push(`srvc.is_featured = true`);
  }

  const limit = req.query.limit ? Number(req.query.limit) : null;
  const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : 1;
  const offset = (page - 1) * limit;

  let whereClause = "";
  if (whereConditions.length > 0) {
    whereClause = "WHERE " + whereConditions.join(" AND ");
  }

  let query = `
  SELECT
      srvc.*,
      prcd.name as procedure_name
    FROM ${constants.models.SERVICE_TABLE} srvc
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prcd ON prcd.id = srvc.procedure_id
    ${whereClause}
    ORDER BY srvc.name DESC
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(srvc.id) OVER()::integer as total
    FROM ${constants.models.SERVICE_TABLE} srvc
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prcd ON prcd.id = srvc.procedure_id
    ${whereClause}
    ORDER BY srvc.name DESC
  `;

  const data = await ServiceModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await ServiceModel.sequelize.query(countQuery, {
    replacements: { ...queryParams },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { services: data, total: count?.[0]?.total ?? 0 };
};

const update = async (req, id) => {
  const [rowCount, rows] = await ServiceModel.update(
    {
      name: req.body.name,
      image: req.body.image,
      slug: req.body.slug,
      procedure_id: req.body.procedure_id,
      actual_price: req.body.actual_price,
      discounted_price: req.body.discounted_price,
      is_featured: req.body.is_featured,
      main_points: req.body.main_points,
      custom_points: req.body.custom_points,
    },
    {
      where: {
        id: req.params.id || id,
      },
      returning: true,
      plain: true,
      raw: true,
    }
  );

  return rows;
};

const getById = async (req, id) => {
  return await ServiceModel.findOne({
    where: { id: req?.params?.id || id },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await ServiceModel.findByPk(req?.params?.id || id);
};

const getBySlug = async (req, slug) => {
  return await ServiceModel.findOne({
    slug: req?.params?.slug || slug,
    plain: true,
  });
};

const deleteById = async (req, id, { transaction }) => {
  return await ServiceModel.destroy(
    {
      where: { id: req.params.id || id },
    },
    { transaction }
  );
};

const countServices = async (last_30_days = false) => {
  let where_query;
  if (last_30_days) {
    where_query = {
      created_at: {
        [Op.gte]: moment()
          .subtract(30, "days")
          .format("YYYY-MM-DD HH:mm:ss.SSSZ"),
      },
    };
  }

  return await ServiceModel.count({
    where: where_query,
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  update: update,
  getById: getById,
  getByPk: getByPk,
  getBySlug: getBySlug,
  deleteById: deleteById,
  getByProcedureId: getByProcedureId,
  countServices: countServices,
};
