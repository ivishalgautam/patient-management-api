"use strict";
import constants from "../../lib/constants/index.js";
import sequelizeFwk, { Op, QueryTypes } from "sequelize";
const { DataTypes } = sequelizeFwk;

let BannerModel = null;

const init = async (sequelize) => {
  BannerModel = sequelize.define(
    constants.models.BANNER_TABLE,
    {
      id: {
        primaryKey: true,
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_featured: { type: DataTypes.BOOLEAN, defaultValue: false },
      type: {
        type: DataTypes.ENUM({ values: ["video", "banner"] }),
        allowNull: false,
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await BannerModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await BannerModel.create(
    {
      url: req.body.url,
      is_featured: req.body.is_featured,
      type: req.body.type,
    },
    { transaction }
  );
};

const get = async (req) => {
  const whereConditions = [];
  let queryParams = {};

  const type = req.query.type ? req.query.type : null;
  if (type) {
    whereConditions.push("bnr.type = :type");
    queryParams.type = type;
  }

  const isFeatured = req.query.featured;
  if (isFeatured !== undefined) {
    whereConditions.push("bnr.is_featured = :is_featured");
    queryParams.is_featured = isFeatured === "1";
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = "";
  if (whereConditions.length)
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
    bnr.id, bnr.url, bnr.created_at, bnr.type, bnr.is_featured
  FROM ${constants.models.BANNER_TABLE} bnr
  ${whereClause}
  ORDER BY bnr.created_at DESC
  LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT 
    COUNT(bnr.id) OVER()::integer AS total
  FROM ${constants.models.BANNER_TABLE} bnr
  ${whereClause}
  `;

  const data = await BannerModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await BannerModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { banners: data, total: count?.[0]?.total ?? 0 };
};

const update = async (req, id) => {
  const [rowCount, rows] = await BannerModel.update(
    {
      url: req.body.url,
      is_featured: req.body.is_featured,
      type: req.body.type,
    },
    {
      where: {
        id: req.params.id || id,
      },
      returning: true,
      raw: true,
    }
  );

  return rows[0];
};

const getById = async (req, id) => {
  return await BannerModel.findOne({
    where: {
      id: req.params.id || id,
    },
  });
};

const getByPk = async (req, id) => {
  return await BannerModel.findByPk(req.params.id || id);
};

const getBySlug = async (req, slug) => {
  return await BannerModel.findOne({
    where: {
      slug: req.params?.slug || slug,
    },
    raw: true,
  });
};

const deleteById = async (req, id, { transaction }) => {
  return await BannerModel.destroy(
    {
      where: { id: req.params.id || id },
    },
    { transaction }
  );
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
};
