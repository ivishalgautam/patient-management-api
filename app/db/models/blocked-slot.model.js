"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let BlockSlotModel = null;

const init = async (sequelize) => {
  BlockSlotModel = sequelize.define(
    constants.models.BLOCKED_SLOT_TABLE,
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
      type: {
        type: DataTypes.ENUM({ values: ["date", "slot"] }),
        allowNull: false,
        validate: {
          isIn: [["date", "slot"]],
        },
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      slots: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await BlockSlotModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  const data = await BlockSlotModel.create(
    {
      clinic_id: req.body.clinic_id,
      type: req.body.type,
      date: req.body.date,
      slots: req.body.slots,
    },
    { transaction }
  );

  return data.dataValues;
};

const get = async (req) => {
  let query = `
  SELECT
      bslt.*
    FROM ${constants.models.BLOCKED_SLOT_TABLE} bslt
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = bslt.clinic_id
    LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = cln.doctor_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = dr.user_id
    WHERE usr.id = :userId
  `;

  return await BlockSlotModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { userId: req.user_data.id },
  });
};

const getById = async (req, id) => {
  return await BlockSlotModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getSlotByClinicId = async (req, id) => {
  return await BlockSlotModel.findOne(
    { where: { clinic_id: req?.params?.id || id } },
    {
      raw: true,
    }
  );
};

const getSlotsByClinicId = async (req, id) => {
  let whereConditions = [`bslt.clinic_id = :clinicId`];
  let queryParams = { clinicId: req?.params?.id || id };

  const page = req.query?.page ? Number(req.query.page) : 1;
  const limit = req.query?.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  const whereQuery = {
    clinic_id: req?.params?.id || id,
  };

  const type = req.query?.type;
  if (type) {
    whereConditions.push(`bslt.type = :type`);
    queryParams.type = type;
  }

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const query = `
  SELECT
        bslt.*
    FROM ${constants.models.BLOCKED_SLOT_TABLE} bslt
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `
  SELECT
        COUNT(bslt.id) OVER()::integer as total
    FROM ${constants.models.BLOCKED_SLOT_TABLE} bslt
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  const data = await BlockSlotModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await BlockSlotModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  return { blocked: data, total: count?.[0]?.total ?? 0 };
};

const getByPk = async (req, id) => {
  return await BlockSlotModel.findByPk(req?.params?.id || id);
};

const getByDoctorId = async (req, doctor_id) => {
  let query = `
    SELECT
        bslt.*
      FROM ${constants.models.BLOCKED_SLOT_TABLE} bslt
      LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = bslt.clinic_id
      LEFT JOIN ${constants.models.DOCTOR_TABLE} dr ON dr.id = cln.doctor_id
      WHERE dr.id = :doctorId
    `;

  return await BlockSlotModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { doctorId: req?.params?.id || doctor_id },
  });
};

const update = async (req, id) => {
  const data = await BlockSlotModel.update(
    {
      type: req.body.type,
      date: req.body.date,
      slots: req.body.slots,
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
  return await BlockSlotModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

const getByDateAndClinic = async (req, clinicId, date) => {
  return await BlockSlotModel.findOne({
    where: {
      clinic_id: req?.query?.clinic || clinicId,
      date: req?.query?.date || date,
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
  getSlotByClinicId: getSlotByClinicId,
  getSlotsByClinicId: getSlotsByClinicId,
  getByPk: getByPk,
  getByDoctorId: getByDoctorId,
  update: update,
  deleteById: deleteById,
  getByDateAndClinic: getByDateAndClinic,
};
