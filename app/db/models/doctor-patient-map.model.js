"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let DoctorPatientMappingModel = null;

const init = async (sequelize) => {
  DoctorPatientMappingModel = sequelize.define(
    constants.models.DOCTOR_PATIENT_TABLE,
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
      patient_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.PATIENT_TABLE,
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

  await DoctorPatientMappingModel.sync({ alter: true });
};

const create = async (doctor_id, patient_id, { transaction }) => {
  return await DoctorPatientMappingModel.create(
    {
      doctor_id: doctor_id,
      patient_id: patient_id,
    },
    { transaction }
  );
};

const get = async (req) => {
  const whereConditions = [`usr.role = 'patient'`];
  const queryParams = {};
  const q = req.query.q ? req.query.q : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query OR usr.username ILIKE :query OR usr.mobile_number ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const { role, id } = req.user_data;
  if (role === "doctor") {
    whereConditions.push(`dr.user_id = :userId`);
    queryParams.userId = id;
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
      usr.id, usr.fullname, usr.username, usr.mobile_number, usr.email, usr.is_active, usr.created_at
    FROM ${constants.models.DOCTOR_PATIENT_TABLE} dp
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = dp.doctor_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = dp.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    LIMIT :limit OFFSET :offset
    `;
  const countQuery = `
    SELECT 
      COUNT(usr.id) OVER()::integer as total
    FROM ${constants.models.DOCTOR_PATIENT_TABLE} dp
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = dp.doctor_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = dp.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    `;

  const users = await DoctorPatientMappingModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await DoctorPatientMappingModel.sequelize.query(countQuery, {
    replacements: { ...queryParams },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { users, total: count?.[0]?.total ?? 0 };
};

const getByDoctorPatientId = async (doctor_id, patient_id) => {
  return await DoctorPatientMappingModel.findOne({
    where: {
      doctor_id: doctor_id,
      patient_id: patient_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await DoctorPatientMappingModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id) => {
  return await DoctorPatientMappingModel.destroy({
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
  getByDoctorPatientId: getByDoctorPatientId,
  getByPk: getByPk,
  deleteById: deleteById,
};
