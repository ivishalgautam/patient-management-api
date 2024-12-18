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
      cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
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

const getByPatientId = async (req, id) => {
  const whereConditions = [`ptusr.id = :patientUserId`];
  const queryParams = { patientUserId: req.user_data.id || id };
  const q = req.query.q ? req.query.q : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const query = `
    SELECT 
      trmnt.id, 
      drusr.fullname as doctor_name, 
      apnt.date, apnt.slot,
      prd.image, prd.name as procedure_name
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = trmnt.clinic_id
    LEFT JOIN ${constants.models.BOOKING_TABLE} apnt ON apnt.id = trmnt.appointment_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = cln.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} ptusr ON ptusr.id = pt.user_id
    LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = dr.user_id
    ${whereClause}
    ORDER BY trmnt.created_at DESC
    LIMIT :limit OFFSET :offset
    `;
  const countQuery = `
    SELECT 
      COUNT(trmnt.id) OVER()::INTEGER AS total
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = trmnt.clinic_id
    LEFT JOIN ${constants.models.BOOKING_TABLE} apnt ON apnt.id = trmnt.appointment_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} ptusr ON ptusr.id = pt.user_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = pt.user_id
    LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = dr.user_id
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
      trmnt.cost,
      usr.id as user_id, usr.fullname, usr.avatar, 
      CONCAT('+', usr.country_code, ' ', usr.mobile_number) as mobile_number,
      pt.emergency_contact
    FROM ${constants.models.TREATMENT_TABLE} trmnt
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = trmnt.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    WHERE trmnt.id = :treatmentId
  `;

  return await TreatmentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: req?.params?.id || id },
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
  getByPatientId: getByPatientId,
};
