"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let TreatmentVisitModel = null;

const init = async (sequelize) => {
  TreatmentVisitModel = sequelize.define(
    constants.models.TREATMENT_VISIT_TABLE,
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
        onDelete: "CASCADE",
      },
      visit_notes: {
        type: DataTypes.JSONB,
        defaultValue: 0,
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
      indexes: [{ fields: ["treatment_id"] }, { fields: ["added_by"] }],
    },
  );

  await TreatmentVisitModel.sync({ alter: true });
};

const create = async (req, { transaction = null }) => {
  return await TreatmentVisitModel.create(
    {
      treatment_id: req.body.treatment_id,
      visit_notes: req.body.visit_notes,
      added_by: req.user_data.id,
    },
    { transaction },
  );
};

const get = async (req) => {
  const whereConditions = [];
  const queryParams = {};
  const q = req.query.q ? req.query.q : null;
  const treatments = req.query.treatments
    ? req.query.treatments.split(".")
    : null;

  if (treatments && Array.isArray(treatments)) {
    whereConditions.push(`vs.treatment_id = any(:treatments)`);
    queryParams.treatments = `{${treatments.join(",")}}`;
  }
  const patients = req.query.patients ? req.query.patients.split(".") : null;

  if (patients && Array.isArray(patients)) {
    whereConditions.push(`trmnt.patient_id = any(:patients)`);
    queryParams.patients = `{${patients.join(",")}}`;
  }

  if (q) {
    whereConditions.push(
      `(vs.remarks ILIKE :query OR CAST(vs.amount_paid AS TEXT) ILIKE :query)`,
    );
    queryParams.query = `%${String(q.trim())}%`;
  }

  let whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      vs.*,
      usr.fullname as added_by,
      sr.name as service_name
    FROM ${constants.models.TREATMENT_VISIT_TABLE} vs
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = vs.treatment_id
    LEFT JOIN ${constants.models.SERVICE_TABLE} sr ON trmnt.service_id = sr.id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = vs.added_by
    ${whereClause}
    ORDER BY vs.created_at desc
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(vs.id) OVER()::integer as total
      FROM ${constants.models.TREATMENT_VISIT_TABLE} vs
      LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = vs.treatment_id
      LEFT JOIN ${constants.models.SERVICE_TABLE} sr ON trmnt.service_id = sr.id
      LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = vs.added_by
    ${whereClause}
  `;

  const data = await TreatmentVisitModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
      limit,
      offset,
    },
    raw: true,
  });

  const count = await TreatmentVisitModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
    },
    raw: true,
  });

  return { visits: data, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, id) => {
  return await TreatmentVisitModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id) => {
  return await TreatmentVisitModel.update(
    {
      visit_notes: req.body.visit_notes,
    },
    {
      where: { id: req?.params?.id || id },
      raw: true,
    },
  );
};

const getByPatientId = async (req, patientId) => {
  const whereConditions = [`trmnt.patient_id = :patientId`];
  const queryParams = { patientId: req?.params?.id || patientId };
  const q = req.query.q ? req.query.q : null;
  const method = req.query.method ? req.query.method.split(".") : null;

  if (q) {
    whereConditions.push(
      `(vs.remarks ILIKE :query OR CAST(vs.amount_paid AS TEXT) ILIKE :query)`,
    );
    queryParams.query = `%${String(q.trim())}%`;
  }

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      vs.*,
      usr.fullname as added_by
    FROM ${constants.models.TREATMENT_VISIT_TABLE} vs
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = vs.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = vs.added_by
    ${whereClause}
    ORDER BY vs.created_at desc
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(vs.id) OVER()::integer as total
      FROM ${constants.models.TREATMENT_VISIT_TABLE} vs
      LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = vs.treatment_id
      LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = vs.added_by
    ${whereClause}
  `;

  const data = await TreatmentVisitModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams, limit, offset },
    raw: true,
  });

  const count = await TreatmentVisitModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: { ...queryParams },
    raw: true,
  });

  return { visits: data, total: count?.[0]?.total ?? 0 };
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };
  const q = req.query.q ? req.query.q : null;
  const type = req.query.type ? req.query.type.split(".") : null;
  const method = req.query.method ? req.query.method.split(".") : null;

  if (q) {
    whereConditions.push(
      `(vs.remarks ILIKE :query OR CAST(vs.amount_paid AS TEXT) ILIKE :query)`,
    );
    queryParams.query = `%${String(q.trim())}%`;
  }
  if (Array.isArray(type)) {
    whereConditions.push(`vs.payment_type = any(:type)`);
    queryParams.type = `{${type.join(",")}}`;
  }
  if (Array.isArray(method)) {
    whereConditions.push(`vs.payment_method = any(:method)`);
    queryParams.method = `{${method.join(",")}}`;
  }

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      vs.*,
      usr.fullname as added_by
    FROM ${constants.models.TREATMENT_VISIT_TABLE} vs
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = vs.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = vs.added_by
    ${whereClause}
    ORDER BY vs.created_at desc
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(vs.id) OVER()::integer as total
      FROM ${constants.models.TREATMENT_VISIT_TABLE} vs
      LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = vs.treatment_id
      LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = vs.added_by
    ${whereClause}
  `;

  const data = await TreatmentVisitModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
      limit,
      offset,
    },
    raw: true,
  });

  const count = await TreatmentVisitModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
    },
    raw: true,
  });

  return { visits: data, total: count?.[0]?.total ?? 0 };
};

const getRemainingPayment = async (req, treatment_id) => {
  let query = `
SELECT 
  (
    COALESCE(tp.total_cost_sum, 0) 
    - COALESCE(vs.total_payment_sum, 0)
  )::integer AS remaining_amount
FROM 
  (
    SELECT SUM(tp.total_cost) AS total_cost_sum 
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp 
    WHERE tp.treatment_id = :treatmentId
  ) tp
FULL OUTER JOIN 
  (
    SELECT 
      SUM(vs.amount_paid + COALESCE(vs.advance_used,0)) 
      AS total_payment_sum
    FROM ${constants.models.TREATMENT_VISIT_TABLE} vs 
    WHERE vs.treatment_id = :treatmentId
  ) vs 
ON true;
    `;

  const data = await TreatmentVisitModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: req?.params?.id || treatment_id },
    raw: true,
    plain: true,
  });
  return { remaining_amount: data.remaining_amount };
};

const getByPk = async (req, id) => {
  return await TreatmentVisitModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id) => {
  return await TreatmentVisitModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

const count = async (clinicId, today = false) => {
  let query = `
  SELECT 
      SUM(py.amount_paid)::integer AS count 
    FROM ${constants.models.TREATMENT_VISIT_TABLE} py 
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trt ON trt.id = py.treatment_id 
    LEFT JOIN ${constants.models.CLINIC_TABLE} cln ON cln.id = trt.clinic_id 
    WHERE 1=1`;
  const replacements = {};

  if (clinicId) {
    query += ` AND cln.id = :clinicId`;
    replacements.clinicId = clinicId;
  }

  if (today) {
    const startOfToday = moment().startOf("day").toISOString();
    const endOfToday = moment().endOf("day").toISOString();

    query += ` AND py.created_at BETWEEN :startOfToday AND :endOfToday`;
    replacements.startOfToday = startOfToday;
    replacements.endOfToday = endOfToday;
  }

  const result = await TreatmentVisitModel.sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return result?.[0]?.count ?? 0;
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getByPk: getByPk,
  deleteById: deleteById,
  update: update,
  getByTreatmentId: getByTreatmentId,
  getRemainingPayment: getRemainingPayment,
  count: count,
  getByPatientId: getByPatientId,
};
