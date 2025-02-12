"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let StaffModel = null;

const init = async (sequelize) => {
  StaffModel = sequelize.define(
    constants.models.STAFF_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
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
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await StaffModel.sync({ alter: true });
};

const create = async (doctor_id, user_id, { transaction }) => {
  return await StaffModel.create(
    {
      doctor_id: doctor_id,
      user_id: user_id,
    },
    { transaction }
  );
};

const getById = async (req, id) => {
  return await StaffModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByUserId = async (req, id) => {
  return await StaffModel.findOne({
    where: {
      user_id: req?.user_data?.id || id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await StaffModel.findByPk(req?.params?.id || id);
};

const get = async (req, id) => {
  const whereConditions = [`dr.user_id = :drUserId`];
  const queryParams = { drUserId: req.user_data.id || id };
  const q = req.query.q ? req.query.q : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query OR usr.username ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = "";
  if (whereConditions.length) {
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;
  }

  const query = `
    SELECT 
      stf.id, usr.id as user_id, usr.fullname, usr.username, usr.mobile_number, usr.email, usr.is_active, usr.created_at
      FROM ${constants.models.STAFF_TABLE} stf
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = stf.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = stf.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  const countQuery = `
    SELECT 
      COUNT(stf.id) OVER()::integer as total 
    FROM ${constants.models.STAFF_TABLE} stf
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = stf.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = stf.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    `;

  const users = await StaffModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await StaffModel.sequelize.query(countQuery, {
    replacements: { ...queryParams },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { staff: users, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await StaffModel.destroy({
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
  getByUserId: getByUserId,
};
