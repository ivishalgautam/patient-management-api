"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let NoteModel = null;

const init = async (sequelize) => {
  NoteModel = sequelize.define(
    constants.models.NOTE_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      patient_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.PATIENT_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      affected_tooths: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        defaultValue: "",
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
        validate: {
          isUUID: "4",
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await NoteModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await NoteModel.create(
    {
      patient_id: req.body.patient_id,
      affected_tooths: req.body.affected_tooths,
      notes: req.body.notes,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await NoteModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await NoteModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await NoteModel.update(
    {
      affected_tooths: req.body.affected_tooths,
      notes: req.body.notes,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      raw: true,
    },
    { transaction }
  );
};

const getByPk = async (req, id) => {
  return await NoteModel.findByPk(req?.params?.id || id);
};

const getByPatientId = async (req, patientId) => {
  const whereConditions = [`nt.patient_id = :patientId`];
  const queryParams = { patientId: req?.params?.id || patientId };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(
      `(prd.name ILIKE :query OR nt.notes ILIKE :query OR usr.fullname ILIKE :query OR nt.affected_tooths ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const at = req.query.at ? req.query.at : null; //affected tooth
  if (at) {
    whereConditions.push(`(nt.affected_tooths ILIKE :query)`);
    queryParams.query = at;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      nt.*,
      usr.fullname as added_by
    FROM ${constants.models.NOTE_TABLE} nt
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = nt.added_by
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(nt.id) OVER()::integer as total
    FROM ${constants.models.NOTE_TABLE} nt
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = nt.added_by
    ${whereClause}
  `;

  const data = await NoteModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await NoteModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { notes: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await NoteModel.destroy({
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
  getByPatientId: getByPatientId,
  deleteById: deleteById,
  update: update,
};
