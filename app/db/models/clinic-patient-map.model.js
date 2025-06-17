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

  const paymentStatus = req.query?.payment_status || null;
  const q = req.query.q ? req.query.q : null;

  if (paymentStatus === "pending") {
    whereConditions.push(
      `COALESCE((
        SELECT SUM(pmnt.amount_paid)
        FROM ${constants.models.PAYMENT_TABLE} pmnt
        INNER JOIN ${constants.models.TREATMENT_TABLE} trmnt ON pmnt.treatment_id = trmnt.id
        WHERE trmnt.patient_id = cp.patient_id
      ), 0) < COALESCE((
        SELECT SUM(tp.total_cost)
        FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
        WHERE tp.patient_id = cp.patient_id
      ), 0)`
    );
  }

  if (paymentStatus === "today_revenue") {
    whereConditions.push(
      `EXISTS (
        SELECT 1
        FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
        WHERE tp.patient_id = cp.patient_id
        AND DATE(tp.created_at) = CURRENT_DATE
      )`
    );
  }

  if (paymentStatus === "today_collection") {
    whereConditions.push(
      `EXISTS (
        SELECT 1
        FROM ${constants.models.PAYMENT_TABLE} pmnt
        INNER JOIN ${constants.models.TREATMENT_TABLE} trmnt ON pmnt.treatment_id = trmnt.id
        WHERE trmnt.patient_id = cp.patient_id
        AND DATE(pmnt.created_at) = CURRENT_DATE
      )`
    );
  }

  if (paymentStatus === "month_revenue") {
    whereConditions.push(
      `EXISTS (
      SELECT 1
      FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
      WHERE tp.patient_id = cp.patient_id
      AND EXTRACT(MONTH FROM tp.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM tp.created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    )`
    );
  }

  if (paymentStatus === "month_collection") {
    whereConditions.push(
      `EXISTS (
      SELECT 1
      FROM ${constants.models.PAYMENT_TABLE} pmnt
      INNER JOIN ${constants.models.TREATMENT_TABLE} trmnt ON pmnt.treatment_id = trmnt.id
      WHERE trmnt.patient_id = cp.patient_id
      AND EXTRACT(MONTH FROM pmnt.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM pmnt.created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    )`
    );
  }

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query OR usr.username ILIKE :query OR usr.mobile_number ILIKE :query OR usr.mobile_number ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const offset = (page - 1) * limit;

  let whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const query = `
    SELECT 
      cp.id, 
      usr.id as user_id, usr.fullname, usr.avatar, usr.username, usr.mobile_number, usr.email, usr.is_active, usr.created_at,
      pt.id AS patient_id,
      COALESCE(tp.total_cost_sum, 0) AS total_cost,
      COALESCE(pmnt.total_amount_paid_sum, 0) AS total_amount_paid
    FROM ${constants.models.CLINIC_PATIENT_TABLE} cp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = cp.patient_id
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.patient_id = cp.patient_id
    LEFT JOIN (
      SELECT 
        tp.patient_id, 
        SUM(tp.total_cost)::integer AS total_cost_sum
      FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
      GROUP BY tp.patient_id
    ) tp ON tp.patient_id = cp.patient_id
    LEFT JOIN (
      SELECT 
        trmnt.patient_id, 
        SUM(pmnt.amount_paid)::integer AS total_amount_paid_sum
      FROM ${constants.models.PAYMENT_TABLE} pmnt
      INNER JOIN ${constants.models.TREATMENT_TABLE} trmnt ON pmnt.treatment_id = trmnt.id
      GROUP BY trmnt.patient_id
    ) pmnt ON pmnt.patient_id = cp.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    GROUP BY 
      cp.id, pt.id, 
      usr.id, tp.total_cost_sum, pmnt.total_amount_paid_sum
    ORDER BY usr.created_at DESC
    LIMIT :limit OFFSET :offset;
  `;

  const countQuery = `
    SELECT 
      COUNT(DISTINCT cp.id) AS total
    FROM ${constants.models.CLINIC_PATIENT_TABLE} cp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = cp.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause};
  `;

  const users = await ClinicPatientMappingModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await ClinicPatientMappingModel.sequelize.query(countQuery, {
    replacements: queryParams,
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
