"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let TreatmentPlanModel = null;

const init = async (sequelize) => {
  TreatmentPlanModel = sequelize.define(
    constants.models.TREATMENT_PLAN_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      treatment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: constants.models.TREATMENT_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        onUpdate: "CASCADE",
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
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // affected_tooths: {
      //   type: DataTypes.JSONB,
      //   allowNull: false,
      // },
      total_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      notes: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      radiographic_diagnosis: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
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

  await TreatmentPlanModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await TreatmentPlanModel.create(
    {
      treatment_id: req.body.treatment_id,
      patient_id: req.body.patient_id,
      radiographic_diagnosis: req.body.radiographic_diagnosis,
      affected_tooths: req.body.affected_tooths,
      total_cost: req.body.total_cost,
      notes: req.body.notes,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentPlanModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await TreatmentPlanModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByToothAndTreatmentId = async (req) => {
  return await TreatmentPlanModel.findOne({
    where: {
      treatment_id: req.body.treatment_id,
      affected_tooths: req.body.affected_tooths,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  return await TreatmentPlanModel.update(
    {
      radiographic_diagnosis: req.body.radiographic_diagnosis,
      affected_tooths: req.body.affected_tooths,
      total_cost: req.body.total_cost,
      notes: req.body.notes,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      raw: true,
      transaction,
    }
  );
};

const getByPk = async (req, id) => {
  return await TreatmentPlanModel.findByPk(req?.params?.id || id);
};

const getByTreatmentId = async (req, treatmentId) => {
  const whereConditions = [`tp.treatment_id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatmentId };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(
      `(prd.name ILIKE :query OR usr.fullname ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const at = req.query.at ? req.query.at : null; //affected tooth
  if (at) {
    whereConditions.push(`(tp.affected_tooths ILIKE :query)`);
    queryParams.query = at;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      tp.*,
      prd.name as procedure_name,
      srvc.name as service_name,
      usr.fullname as added_by
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = tp.patient_id
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = tp.added_by
    ${whereClause}
    ORDER BY tp.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(tp.id) OVER()::integer as total
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = tp.patient_id
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = tp.added_by
    ${whereClause}
  `;

  const data = await TreatmentPlanModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await TreatmentPlanModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { plans: data, total: count?.[0]?.total ?? 0 };
};

const getByPatientId = async (req, patientId) => {
  const whereConditions = [`pt.id = :patientId`];
  const queryParams = { patientId: req?.params?.id || patientId };

  const q = req.query.q ? req.query.q : null;
  if (q) {
    whereConditions.push(
      `(prd.name ILIKE :query OR usr.fullname ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  const at = req.query.at ? req.query.at : null; //affected tooth
  if (at) {
    whereConditions.push(`(tp.affected_tooths ILIKE :query)`);
    queryParams.query = at;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  let query = `
  SELECT
      tp.*,
      prd.name as procedure_name,
      srvc.name as service_name,
      usr.fullname as added_by
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = tp.patient_id
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = tp.added_by
    ${whereClause}
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(tp.id) OVER()::integer as total
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    LEFT JOIN ${constants.models.PATIENT_TABLE} pt ON pt.id = tp.patient_id
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = tp.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} srvc ON srvc.id = trmnt.service_id
    LEFT JOIN ${constants.models.PROCEDURE_TABLE} prd ON prd.id = srvc.procedure_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = tp.added_by
    ${whereClause}
  `;

  const data = await TreatmentPlanModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await TreatmentPlanModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { plans: data, total: count?.[0]?.total ?? 0 };
};

const deleteById = async (req, id) => {
  return await TreatmentPlanModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

const countRemainingCostByTreatmentId = async (
  treatment_id,
  { transaction }
) => {
  const query = `
  SELECT 
      COALESCE(SUM(tp.total_cost)::integer, 0) - COALESCE(SUM(pmnt.amount_paid)::integer, 0) as remaining_cost
    FROM (
    SELECT 
      SUM(tp.total_cost) as total_cost
      FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
      WHERE tp.treatment_id = :treatmentId
    ) tp
    FULL OUTER JOIN (
    SELECT 
      SUM(pmnt.amount_paid) as amount_paid
      FROM ${constants.models.PAYMENT_TABLE} pmnt
      WHERE pmnt.treatment_id = :treatmentId
    ) pmnt ON true
  `;

  const data = await TreatmentPlanModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: treatment_id },
    plain: true,
    raw: true,
    transaction,
  });

  return data?.remaining_cost ?? 0;
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
  getByToothAndTreatmentId: getByToothAndTreatmentId,
  countRemainingCostByTreatmentId: countRemainingCostByTreatmentId,
};
