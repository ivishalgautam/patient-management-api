"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let DoctorServiceMapModel = null;

const init = async (sequelize) => {
  DoctorServiceMapModel = sequelize.define(
    constants.models.DOCTOR_SERVICE_MAP_TABLE,
    {
      id: {
        primaryKey: true,
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      doctor_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.DOCTOR_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        validate: {
          isUUID: 4,
        },
      },
      service_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.SERVICE_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        validate: {
          isUUID: 4,
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await DoctorServiceMapModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  const data = await DoctorServiceMapModel.create(
    {
      doctor_id: req.body.doctor_id,
      service_id: req.body.service_id,
    },
    {
      transaction,
    }
  );

  return data.dataValues;
};

const get = async (req) => {
  const { role, id } = req.user_data;
  let whereConditions = [];
  const queryParams = {};
  let q = req.query.q;

  if (q) {
    whereConditions.push(`srvc.name ILIKE :query`);
    queryParams.query = `%${q}%`;
  }

  if (role === "doctor") {
    whereConditions.push(`dr.user_id = :userId`);
    queryParams.userId = id;
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
      drsr.id, srvc.name, srvc.image, drsr.doctor_id, drsr.service_id, drsr.created_at
    FROM ${constants.models.DOCTOR_SERVICE_MAP_TABLE} drsr
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = drsr.service_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = drsr.doctor_id
    ${whereClause}
    ORDER BY drsr.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(drsr.id) OVER()::integer as total
    FROM ${constants.models.DOCTOR_SERVICE_MAP_TABLE} drsr
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = drsr.service_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = drsr.doctor_id
    ${whereClause}
  `;

  const data = await DoctorServiceMapModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await DoctorServiceMapModel.sequelize.query(countQuery, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { services: data, total: count?.[0]?.total ?? 0 };
};

const getByServiceId = async (req, id) => {
  let whereConditions = [`srvc.id = :serviceId`];
  const queryParams = { serviceId: req?.params?.id || id };

  let q = req.query.q;
  if (q) {
    whereConditions.push(`srvc.name ILIKE :query`);
    queryParams.query = `%${q}%`;
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
      usr.fullname, dr.id as doctor_id, usr.gender, usr.avatar
    FROM ${constants.models.DOCTOR_SERVICE_MAP_TABLE} drsr
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = drsr.service_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = drsr.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = dr.user_id
    ${whereClause}
    ORDER BY drsr.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(drsr.id) OVER()::integer as total
    FROM ${constants.models.DOCTOR_SERVICE_MAP_TABLE} drsr
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = drsr.service_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = drsr.doctor_id
    ${whereClause}
  `;

  const data = await DoctorServiceMapModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await DoctorServiceMapModel.sequelize.query(countQuery, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { doctors: data, total: count?.[0]?.total ?? 0 };
};

const getByPk = async (req, id) => {
  return await DoctorServiceMapModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id, { transaction }) => {
  return await DoctorServiceMapModel.destroy(
    {
      where: { id: req?.params?.id || id },
    },
    { transaction }
  );
};

const getByDoctorAndServiceId = async (req, doctor_id, service_id) => {
  return await DoctorServiceMapModel.count({
    where: {
      doctor_id: req?.body?.doctor_id || doctor_id,
      service_id: req?.body?.service_id || service_id,
    },
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  getByPk: getByPk,
  getByDoctorAndServiceId: getByDoctorAndServiceId,
  deleteById: deleteById,
  getByServiceId: getByServiceId,
};
