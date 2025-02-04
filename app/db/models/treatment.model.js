"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let TreatmentModel = null;

const init = async (sequelize) => {
  TreatmentModel = sequelize.define(
    constants.models.TREATMENT_TABLE,
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
        references: {
          model: constants.models.CLINIC_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
      patient_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.PATIENT_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
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
      },
      appointment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.BOOKING_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
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
      },
      cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "close"),
        defaultValue: "active",
        validate: {
          isIn: [["active", "close"]],
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await TreatmentModel.sync({ alter: true });
};

const create = async (
  req,
  { patient_id, clinic_id, service_id, appointment_id, cost },
  { transaction }
) => {
  return await TreatmentModel.create(
    {
      patient_id: patient_id,
      clinic_id: clinic_id,
      service_id: service_id,
      appointment_id: appointment_id,
      cost: cost,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getByClinicId = async (req, id) => {
  const whereConditions = [`trmnt.clinic_id = :clinicId`];
  const queryParams = { clinicId: req.params.id || id };
  const q = req.query.q ? req.query.q : null;
  const username = req.query.username ? req.query.username : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  if (username) {
    whereConditions.push(`(usr.username = :username)`);
    queryParams.username = username;
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
      trmnt.id, usr.fullname, usr.username, usr.mobile_number, usr.email, usr.is_active, usr.created_at,
      pt.id as patient_id,
      srvc.name as service_name
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    ORDER BY usr.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  const countQuery = `
    SELECT 
      COUNT(usr.id) OVER()::integer as total
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    ${whereClause}
    `;

  const users = await TreatmentModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await TreatmentModel.sequelize.query(countQuery, {
    replacements: { ...queryParams },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { users, total: count?.[0]?.total ?? 0 };
};

const getByPatientAndClinicId = async (req, patient_id, clinic_id) => {
  const whereConditions = [`pt.id = :patientId AND cln.id = :clinicId`];
  const queryParams = {
    patientId: patient_id,
    clinicId: clinic_id,
  };
  const q = req.query.q ? req.query.q : null;

  if (q) {
    whereConditions.push(
      `(drusr.fullname ILIKE :query OR srvc.name ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const query = `
    SELECT 
      trmnt.id, trmnt.status, trmnt.created_at,
      pt.id as patient_id,
      srvc.name as service_name,
      drusr.fullname as added_by
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = trmnt.clinic_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = trmnt.added_by
    ${whereClause}
    ORDER BY trmnt.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  const countQuery = `
    SELECT 
      COUNT(trmnt.id) OVER()::integer as total
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = trmnt.clinic_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = trmnt.added_by
    ${whereClause}
    `;

  const treatments = await TreatmentModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await TreatmentModel.sequelize.query(countQuery, {
    replacements: { ...queryParams },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { treatments, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, id) => {
  let query = `
  SELECT 
      trmnt.id as treatment_id,
      SUM(tp.total_cost)::integer as cost,
      usr.id as user_id, usr.fullname, usr.avatar, 
      CONCAT('+', usr.country_code, ' ', usr.mobile_number) as mobile_number,
      pt.emergency_contact,
      (SUM(tp.total_cost)::integer - COALESCE(payment_summary.total_paid, 0)::integer) as balance,
      srv.name as service_name
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN (
      SELECT treatment_id, SUM(amount_paid) as total_paid 
      FROM ${constants.models.PAYMENT_TABLE} 
      GROUP BY treatment_id
    ) payment_summary ON trmnt.id = payment_summary.treatment_id
    LEFT JOIN ${constants.models.TREATMENT_PLAN_TABLE} tp ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srv ON srv.id = trmnt.service_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    WHERE trmnt.id = :treatmentId
    GROUP BY trmnt.id, usr.id, pt.emergency_contact, payment_summary.total_paid, srv.name;
  `;

  return await TreatmentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: req?.params?.id || id },
    plain: true,
    raw: true,
  });
};

const getPatientDetailsByPatientAndClinicId = async (patientId, clinicId) => {
  let query = `
  SELECT 
    SUM(COALESCE(tp.total_cost_sum, 0)) AS cost,
    SUM(
      CASE 
        WHEN tp.total_cost_sum IS NULL THEN 0
        ELSE (COALESCE(tp.total_cost_sum, 0) - COALESCE(pmnt.amount_paid_sum, 0))
      END
    ) AS balance,
    usr.id AS user_id, usr.fullname, usr.avatar, 
    CONCAT('+', usr.country_code, ' ', usr.mobile_number) AS mobile_number,
    pt.emergency_contact
  FROM 
    ${constants.models.TREATMENT_TABLE} trmnt
  LEFT JOIN 
    ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
  LEFT JOIN 
    (SELECT treatment_id, SUM(amount_paid)::integer AS amount_paid_sum 
    FROM ${constants.models.PAYMENT_TABLE} 
    GROUP BY treatment_id) pmnt ON pmnt.treatment_id = trmnt.id
  LEFT JOIN 
    (SELECT treatment_id, SUM(total_cost)::integer AS total_cost_sum 
    FROM ${constants.models.TREATMENT_PLAN_TABLE} 
    GROUP BY treatment_id) tp ON tp.treatment_id = trmnt.id
  LEFT JOIN 
    ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
  WHERE 
    trmnt.patient_id = :patientId AND trmnt.clinic_id = :clinicId
  GROUP BY 
    usr.id, pt.emergency_contact;
  `;

  return await TreatmentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { patientId, clinicId },
    raw: true,
    plain: true,
  });
};

const getByPatientId = async (req, id) => {
  let query = `
  SELECT
      trmnt.*
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    WHERE pt.id = :patientId
    ORDER BY trmnt.created_at desc
  `;

  return await TreatmentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { patientId: req?.params?.id || id },
    plain: true,
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await TreatmentModel.findByPk(req?.params?.id || id);
};

const getByDoctorId = async (clinic_id) => {
  return await TreatmentModel.findOne({
    where: {
      clinic_id: clinic_id,
    },
    raw: true,
  });
};

const deleteById = async (req, id) => {
  return await TreatmentModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  const [, rows] = await TreatmentModel.update(
    { status: req.body.status },
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      raw: true,
      plain: true,
      transaction,
    }
  );

  return rows;
};

const getByClinicPatientServiceId = async (
  patient_id,
  clinic_id,
  service_id
) => {
  return await TreatmentModel.findOne({
    where: {
      patient_id: patient_id,
      clinic_id: clinic_id,
      service_id: service_id,
    },
    raw: true,
  });
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

  return await TreatmentModel.count({
    where: whereCondition,
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getByClinicId: getByClinicId,
  getByPk: getByPk,
  getByDoctorId: getByDoctorId,
  deleteById: deleteById,
  getByClinicPatientServiceId: getByClinicPatientServiceId,
  count: count,
  getByPatientAndClinicId: getByPatientAndClinicId,
  getByPatientId: getByPatientId,
  getPatientDetailsByPatientAndClinicId: getPatientDetailsByPatientAndClinicId,
  update: update,
};
