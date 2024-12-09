"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let ClinicModel = null;

const init = async (sequelize) => {
  ClinicModel = sequelize.define(
    constants.models.CLINIC_TABLE,
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
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Clinic name is required." },
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Clinic address is required." },
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await ClinicModel.sync({ alter: true });
};

const create = async (req, doctor_id, { transaction }) => {
  return await ClinicModel.create(
    {
      doctor_id: doctor_id,
      name: req.body.name,
      address: req.body.address,
    },
    { transaction }
  );
};

const getById = async (req, id) => {
  return await ClinicModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await ClinicModel.findByPk(req?.params?.id || id);
};

const get = async (req) => {
  const whereConditions = [];
  const queryParams = {};
  const { id, role } = req.user_data;

  if (role === "doctor") {
    whereConditions.push("usr.id = :userId");
    queryParams.userId = id;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = "";
  if (whereConditions.length) {
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;
  }

  let query = `
  SELECT
      clnc.*
    FROM ${constants.models.CLINIC_TABLE} clnc
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = clnc.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = dr.user_id
    ${whereClause} 
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(clnc.id) OVER()::integer as total
    FROM ${constants.models.CLINIC_TABLE} clnc
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = clnc.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = dr.user_id
    ${whereClause} 
    LIMIT :limit OFFSET :offset
  `;

  const clinics = await ClinicModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await ClinicModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  return { clinics, total: count?.[0]?.total ?? 0 };
};

const update = async (req, id) => {
  return await ClinicModel.update(
    {
      name: req.body.name,
      address: req.body.address,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      plain: true,
    }
  );
};

const deleteById = async (req, id) => {
  return await ClinicModel.destroy({
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
  update: update,
  deleteById: deleteById,
};
