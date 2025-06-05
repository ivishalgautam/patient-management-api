"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let PatientModel = null;

const init = async (sequelize) => {
  PatientModel = sequelize.define(
    constants.models.PATIENT_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
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
      blood_group: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      marital_status: {
        type: DataTypes.ENUM({ values: ["single", "married", ""] }),
        allowNull: true,
        defaultValue: "",
      },
      height_in_cm: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      emergency_contact: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      source: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await PatientModel.sync({ alter: true });
};

const create = async (req, user_id, { transaction }) => {
  const data = await PatientModel.create(
    {
      user_id: user_id,
      blood_group: req.body.blood_group,
      marital_status: req.body.marital_status,
      height_in_cm: req.body.height_in_cm,
      emergency_contact: req.body.emergency_contact,
      source: req.body.source,
    },
    { transaction }
  );

  return data.dataValues;
};

const bulkCreate = async (patientData, { transaction }) => {
  return await PatientModel.bulkCreate(patientData, {
    transaction,
    returning: true,
  });
};

const get = async (req) => {
  const whereConditions = [];
  const queryParams = {};
  const q = req.query.q ? req.query.q : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.username ILIKE :query)`
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
    pt.id as patient_id, 
    usr.fullname, usr.username
  FROM ${constants.models.PATIENT_TABLE} pt
  LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
  ${whereClause}
  ORDER BY usr.created_at DESC
  LIMIT :limit OFFSET :offset
  `;

  const patients = await PatientModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { patients };
};

const getById = async (req, id) => {
  let query = `
  SELECT
      pt.*,
      usr.id as user_id, usr.fullname, usr.avatar, 
      CONCAT('+', usr.country_code, ' ', usr.mobile_number) as mobile_number
    FROM ${constants.models.PATIENT_TABLE} pt
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pt.user_id
    WHERE pt.id = :patientId
  `;

  return await PatientModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { patientId: req?.params?.id || id },
    plain: true,
    raw: true,
  });
};
const getByUserId = async (user_id) => {
  return await PatientModel.findOne({
    where: {
      user_id: user_id,
    },
    raw: true,
  });
};

const update = async (req, id) => {
  return await PatientModel.update(
    {
      blood_group: req.body.blood_group,
      marital_status: req.body.marital_status,
      height_in_cm: req.body.height_in_cm,
      emergency_contact: req.body.emergency_contact,
      source: req.body.source,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      plain: true,
    }
  );
};

const updateByUserId = async (req, id) => {
  return await PatientModel.update(
    {
      blood_group: req.body.blood_group,
      marital_status: req.body.marital_status,
      height_in_cm: req.body.height_in_cm,
      emergency_contact: req.body.emergency_contact,
      source: req.body.source,
    },
    {
      where: {
        user_id: req?.params?.id || id,
      },
      plain: true,
    }
  );
};

const deleteById = async (req, id) => {
  return await PatientModel.destroy({
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
  getByUserId: getByUserId,
  update: update,
  deleteById: deleteById,
  updateByUserId: updateByUserId,
  bulkCreate: bulkCreate,
};
