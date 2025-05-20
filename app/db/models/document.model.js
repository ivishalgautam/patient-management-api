"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let DocumentModel = null;

const init = async (sequelize) => {
  DocumentModel = sequelize.define(
    constants.models.DOCUMENT_TABLE,
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
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      documents: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
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

  await DocumentModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await DocumentModel.create(
    {
      patient_id: req.body.patient_id,
      title: req.body.title,
      documents: req.body.documents,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await DocumentModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await DocumentModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await DocumentModel.update(
    {
      title: req.body.title,
      documents: req.body.documents,
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
  return await DocumentModel.findByPk(req?.params?.id || id);
};

const getByPatientId = async (req, patient_id) => {
  const whereConditions = [`doc.patient_id = :patientId`];
  const queryParams = { patientId: req?.params?.id || patient_id };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(
      `(doc.title ILIKE :query OR usr.fullname ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      doc.*,
      usr.fullname as added_by
    FROM ${constants.models.DOCUMENT_TABLE} doc
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = doc.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = doc.added_by
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(doc.id) OVER()::integer as total
    FROM ${constants.models.DOCUMENT_TABLE} doc
    LEFT JOIN ${constants.models.PATIENT_TABLE} trmnt ON trmnt.id = doc.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = doc.added_by
    ${whereClause}
  `;

  const data = await DocumentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await DocumentModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { documents: data, total: count?.[0]?.total ?? 0 };
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`doc.treatment_id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(
      `(doc.title ILIKE :query OR usr.fullname ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      doc.*,
      usr.fullname as added_by
    FROM ${constants.models.DOCUMENT_TABLE} doc
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = doc.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = doc.added_by
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(doc.id) OVER()::integer as total
    FROM ${constants.models.DOCUMENT_TABLE} doc
    LEFT JOIN ${constants.models.PATIENT_TABLE} trmnt ON trmnt.id = doc.patient_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = doc.added_by
    ${whereClause}
  `;

  const data = await DocumentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await DocumentModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { documents: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await DocumentModel.destroy({
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
  getByTreatmentId: getByTreatmentId,
  deleteById: deleteById,
  update: update,
};
