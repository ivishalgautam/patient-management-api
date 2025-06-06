"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let ClinicStaffMappingModel = null;

const init = async (sequelize) => {
  ClinicStaffMappingModel = sequelize.define(
    constants.models.CLINIC_STAFF_TABLE,
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
      staff_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.STAFF_TABLE,
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

  await ClinicStaffMappingModel.sync({ alter: true });
};

const create = async (staff_id, clinic_id, { transaction }) => {
  return await ClinicStaffMappingModel.create(
    {
      staff_id: staff_id,
      clinic_id: clinic_id,
    },
    { transaction }
  );
};

const get = async (req, id) => {
  const whereConditions = [`dr.user_id = :drUserId`, `cln.id = :clinicId`];
  const queryParams = {
    drUserId: req.user_data.id,
    clinicId: req?.params?.id || id,
  };
  const q = req.query.q ? req.query.q : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query OR usr.username ILIKE :query OR usr.mobile_number ILIKE :query)`
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
      cstf.id, usr.id as user_id, usr.fullname, usr.username, usr.mobile_number, usr.email, usr.is_active, usr.created_at,
      stf.id as staff_id
    FROM ${constants.models.CLINIC_STAFF_TABLE} cstf
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = cstf.clinic_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = cln.doctor_id
    LEFT JOIN ${constants.models.STAFF_TABLE} stf ON stf.id = cstf.staff_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = stf.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    LIMIT :limit OFFSET :offset
    `;
  const countQuery = `
    SELECT 
      COUNT(cstf.id) OVER()::integer as total 
    FROM ${constants.models.CLINIC_STAFF_TABLE} cstf
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = cstf.clinic_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = cln.doctor_id
    LEFT JOIN ${constants.models.STAFF_TABLE} stf ON stf.id = cstf.staff_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = stf.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    `;

  const users = await ClinicStaffMappingModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await ClinicStaffMappingModel.sequelize.query(countQuery, {
    replacements: { ...queryParams },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { staff: users, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, id) => {
  return await ClinicStaffMappingModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByClinicPatientId = async (staff_id, clinic_id) => {
  return await ClinicStaffMappingModel.findOne({
    where: {
      staff_id: staff_id,
      clinic_id: clinic_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await ClinicStaffMappingModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id, { transaction }) => {
  return await ClinicStaffMappingModel.destroy(
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

  return await ClinicStaffMappingModel.count({
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
