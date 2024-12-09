"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let ClinicPatientMappingModel = null;

const init = async (sequelize) => {
  ClinicPatientMappingModel = sequelize.define(
    constants.models.CLINIC_PATIENT_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.CLINIC_TABLE,
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

  await ClinicPatientMappingModel.sync({ alter: true });
};

const create = async (patient_id, clinic_id, { transaction }) => {
  return await ClinicPatientMappingModel.create(
    {
      patient_id: patient_id,
      clinic_id: clinic_id,
    },
    { transaction }
  );
};

const get = async (req, id) => {
  const whereConditions = [`cp.clinic_id = :clinicId`];
  const queryParams = { clinicId: req.params.id || id };
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
      cp.id, usr.fullname, usr.username, usr.mobile_number, usr.email, usr.is_active, usr.created_at,
      pt.id as patient_id
    FROM ${constants.models.CLINIC_PATIENT_TABLE} cp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = cp.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  const countQuery = `
    SELECT 
      COUNT(usr.id) OVER()::integer as total
    FROM ${constants.models.CLINIC_PATIENT_TABLE} cp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = cp.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    LIMIT :limit OFFSET :offset
    `;

  const users = await ClinicPatientMappingModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await ClinicPatientMappingModel.sequelize.query(countQuery, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { users, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, id) => {
  return await ClinicPatientMappingModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByClinicPatientId = async (patient_id, clinic_id) => {
  return await ClinicPatientMappingModel.findOne({
    where: {
      patient_id: patient_id,
      clinic_id: clinic_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await ClinicPatientMappingModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id, { transaction }) => {
  return await ClinicPatientMappingModel.destroy(
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      raw: true,
    },
    { transaction }
  );
};

const count = async (clinicId, today = false) => {
  const whereCondition = {};
  if (clinicId) {
    whereCondition.clinic_id = clinicId;
  }

  if (today) {
    const startOfToday = moment().startOf("day").toDate();
    const endOfToday = moment().endOf("day").toDate();

    whereCondition.created_at = {
      [Op.between]: [startOfToday, endOfToday],
    };
  }

  return await ClinicPatientMappingModel.count({
    where: whereCondition,
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getByClinicPatientId: getByClinicPatientId,
  getByPk: getByPk,
  deleteById: deleteById,
  count: count,
};
