"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let BookingModel = null;

const init = async (sequelize) => {
  BookingModel = sequelize.define(
    constants.models.BOOKING_TABLE,
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
        references: {
          model: constants.models.DOCTOR_TABLE,
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
      service_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.SERVICE_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "CASCADE",
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      slot: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(["pending", "canceled", "completed"]),
        defaultValue: "pending",
        validate: { isIn: [["pending", "canceled", "completed"]] },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await BookingModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  const data = await BookingModel.create(
    {
      doctor_id: req.body.doctor_id,
      patient_id: req.body.patient_id,
      clinic_id: req.body.clinic_id,
      service_id: req.body.service_id,
      date: req.body.date,
      slot: req.body.slot,
    },
    { transaction }
  );

  return data.dataValues;
};

const get = async (req) => {
  const { role, id } = req.user_data;
  const whereConditions = [];
  const queryParams = {};
  const recent = req.query.recent == 1;
  const status = req.query.status || null;
  if (recent) {
    whereConditions.push(`bk.date >= :date`);
    queryParams.date = moment().format("YYYY-MM-DD");
  }

  if (status) {
    whereConditions.push(`bk.status = :status`);
    queryParams.status = status;
  }

  if (role === "doctor") {
    whereConditions.push(`dr.user_id = :userId`);
    queryParams.userId = id;
  }

  if (role === "patient") {
    whereConditions.push(`pt.user_id = :userId`);
    queryParams.userId = id;
  }
  let page = req.query.page ? Number(req.query.page) : 1;
  let limit = req.query.limit ? Number(req.query.limit) : null;
  let offset = (page - 1) * limit;

  let whereClause = "";

  if (whereConditions.length)
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      bk.id, bk.date, bk.slot, bk.status, bk.created_at, bk.clinic_id,
      drusr.fullname as doctor_name, drusr.avatar as doctor_avatar,
      srvc.id as service_id, srvc.name as service_name
    FROM ${constants.models.BOOKING_TABLE} bk
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = bk.service_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = bk.patient_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = bk.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = dr.user_id
    LEFT JOIN ${constants.models.USER_TABLE} ptusr ON ptusr.id = pt.user_id
    ${whereClause}
    ORDER BY bk.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(bk.id) OVER()::INTEGER total
      FROM ${constants.models.BOOKING_TABLE} bk
      LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = bk.patient_id
      LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = bk.doctor_id
      LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = dr.user_id
      LEFT JOIN ${constants.models.USER_TABLE} ptusr ON ptusr.id = pt.user_id
      ${whereClause}
  `;

  const data = await BookingModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await BookingModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { bookings: data, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, id) => {
  return await BookingModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByDateAndClinic = async (req, clinicId, date) => {
  return await BookingModel.findAll({
    where: {
      clinic_id: req?.query?.clinic || clinicId,
      date: req?.query?.date || date,
      status: "pending",
    },
    returning: true,
    raw: true,
  });
};

const getBookingsByClinicId = async (req, id) => {
  const whereConditions = [`bk.clinic_id = :clinicId`];
  const queryParams = { clinicId: req?.params?.id || id };

  const recent = req.query.recent == 1;
  const today = req.query.today == 1;
  const status = req.query.status || null;
  const startDate = req.query.start_date || null;
  const endDate = req.query.end_date || null;

  if (recent) {
    whereConditions.push(`bk.date >= :date`);
    queryParams.date = moment().format("YYYY-MM-DD");
  }

  // if (today) {
  //   whereConditions.push(`bk.date = :todayDate`);
  //   queryParams.todayDate = moment().format("YYYY-MM-DD");
  // }

  if (startDate && endDate) {
    whereConditions.push(`bk.date BETWEEN :startDate AND :endDate`);
    queryParams.startDate = startDate;
    queryParams.endDate = endDate;
  } else if (startDate) {
    whereConditions.push(`bk.date >= :startDate`);
    queryParams.startDate = startDate;
  } else if (endDate) {
    whereConditions.push(`bk.date <= :endDate`);
    queryParams.endDate = endDate;
  }

  if (status) {
    whereConditions.push(`bk.status = :status`);
    queryParams.status = status;
  }

  let page = req.query.page ? Number(req.query.page) : 1;
  let limit = req.query.limit ? Number(req.query.limit) : null;
  let offset = (page - 1) * limit;

  let whereClause = "";

  if (whereConditions.length)
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      bk.id, bk.date, bk.slot, bk.status, bk.created_at,
      pt.id as patient_id,
      ptusr.fullname as patient_name,
      CONCAT('+', ptusr.country_code, ' ', ptusr.mobile_number) as patient_contact,
      drusr.fullname as doctor_name,
      srvc.name as service_name
    FROM ${constants.models.BOOKING_TABLE} bk
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = bk.service_id
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = bk.patient_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = bk.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = dr.user_id
    LEFT JOIN ${constants.models.USER_TABLE} ptusr ON ptusr.id = pt.user_id
    ${whereClause}
    ORDER BY bk.created_at DESC
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(bk.id) OVER()::INTEGER total
      FROM ${constants.models.BOOKING_TABLE} bk
      LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = bk.patient_id
      LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = bk.doctor_id
      LEFT JOIN ${constants.models.USER_TABLE} drusr ON drusr.id = dr.user_id
      LEFT JOIN ${constants.models.USER_TABLE} ptusr ON ptusr.id = pt.user_id
      ${whereClause}
  `;

  const data = await BookingModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await BookingModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { bookings: data, total: count?.[0]?.total ?? 0 };
};

const getByClinicDateAndSlot = async (req, clinic_id, slot, date) => {
  return await BookingModel.count({
    where: {
      clinic_id: req?.body?.clinic_id || clinic_id,
      slot: req?.body?.slot || slot,
      date: req?.body?.date || date,
      status: "pending",
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await BookingModel.findByPk(req?.params?.id || id);
};

const getByDoctorId = async (doctor_id) => {
  return await PatientModel.findOne({
    where: {
      doctor_id: doctor_id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  const data = await BookingModel.update(
    {
      doctor_id: req.body.doctor_id,
      patient_id: req.body.patient_id,
      clinic_id: req.body.clinic_id,
      date: req.body.date,
      slot: req.body.slot,
      status: req.body.status,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      plain: true,
      raw: true,
      transaction,
    }
  );

  return data[1];
};

const updateStatus = async (req, id) => {
  const data = await BookingModel.update(
    {
      status: req.body.status,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      plain: true,
    }
  );

  return data[1];
};

const deleteById = async (req, id) => {
  return await BookingModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

const count = async (clinicId, today = false) => {
  const whereCondition = {};

  if (clinicId) whereCondition.clinic_id = clinicId;

  if (today) {
    const startOfToday = moment().startOf("day").toDate();
    const endOfToday = moment().endOf("day").toDate();

    whereCondition.date = {
      [Op.between]: [startOfToday, endOfToday],
    };
  }

  return await BookingModel.count({
    where: whereCondition,
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getBookingsByClinicId: getBookingsByClinicId,
  getByPk: getByPk,
  getByDoctorId: getByDoctorId,
  update: update,
  updateStatus: updateStatus,
  deleteById: deleteById,
  getByClinicDateAndSlot: getByClinicDateAndSlot,
  count: count,
  getByDateAndClinic: getByDateAndClinic,
};
