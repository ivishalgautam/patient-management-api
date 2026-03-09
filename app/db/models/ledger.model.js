"use strict";

import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let LedgerModel = null;

const init = async (sequelize) => {
  LedgerModel = sequelize.define(
    constants.models.LEDGER_TABLE,
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
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
        allowNull: true,
        references: {
          model: constants.models.SERVICE_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onDelete: "SET NULL",
      },

      reference_type: {
        type: DataTypes.ENUM(
          "treatment_payment",
          "treatment_plan",
          "expense",
          "refund",
          "adjustment"
        ),
        allowNull: false,
      },

      entry_type: {
        type: DataTypes.ENUM("debit", "credit"),
        allowNull: false,
      },

      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      description: {
        type: DataTypes.STRING,
        defaultValue: "",
      },

      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.USER_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
      },
    },
    {
      tableName: constants.models.LEDGER_TABLE,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [{ fields: ["clinic_id"] }, { fields: ["patient_id"] }],
    }
  );

  await LedgerModel.sync({ alter: true });
};

const create = async (req, transaction = null) => {
  return LedgerModel.create(
    {
      service_id: treatment.service_id,
      clinic_id: req.body.clinic_id,
      patient_id: req.body.patient_id,
      reference_type: req.body.reference_type,
      entry_type: req.body.entry_type,
      amount: req.body.amount,
      description: req.body.description,
      created_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async (req) => {
  const whereConditions = [];
  const queryParams = {};

  const clinicId = req?.query?.clinic_id || null;
  const patientId = req?.query?.patient_id || null;

  if (clinicId) {
    whereConditions.push("ld.clinic_id = :clinicId");
    queryParams.clinicId = clinicId;
  }
  if (patientId) {
    whereConditions.push("ld.patient_id = :patientId");
    queryParams.patientId = patientId;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  let query = `
  SELECT
      ld.*,
      usr.fullname as created_by,
      sr.name as service_name
    FROM ${constants.models.LEDGER_TABLE} ld
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = ld.created_by
    LEFT JOIN ${constants.models.SERVICE_TABLE} sr ON sr.id = ld.service_id
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(ld.id) OVER()::integer as total
    FROM ${constants.models.LEDGER_TABLE} ld
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = ld.created_by
    LEFT JOIN ${constants.models.SERVICE_TABLE} sr ON sr.id = ld.service_id
    ${whereClause}
  `;

  const data = await LedgerModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await LedgerModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { ledger: data, total: count?.[0]?.total ?? 0 };
};

const ledgerBalanceByClinicAndPatient = async (req, clinicId, patientId) => {
  const query = `
    SELECT 
    SUM(
        CASE 
        WHEN entry_type = 'credit' THEN amount
        ELSE -amount
        END
    )::integer AS balance
    FROM ledgers
    WHERE clinic_id = :clinic_id AND patient_id = :patient_id;
`;
  const data = await LedgerModel.sequelize.query(query, {
    replacements: {
      clinic_id: req.params?.clinic_id || clinicId,
      patient_id: req.params?.patient_id || patientId,
    },
    type: QueryTypes.SELECT,
    raw: true,
    plain: true,
  });

  return data?.balance ?? 0;
};

const getById = async (req, id) => {
  return await LedgerModel.findOne({
    where: { id: req?.params?.id || id },
    raw: true,
  });
};

const deleteById = async (req, id, transaction = null) => {
  return await LedgerModel.destroy(
    {
      where: { id: req.params.id || id },
    },
    { transaction }
  );
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  deleteById: deleteById,
  ledgerBalanceByClinicAndPatient: ledgerBalanceByClinicAndPatient,
};
