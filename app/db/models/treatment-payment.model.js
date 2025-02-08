"use strict";
import moment from "moment";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, Op, QueryTypes } from "sequelize";

let TreatmentPaymentModel = null;

const init = async (sequelize) => {
  TreatmentPaymentModel = sequelize.define(
    constants.models.PAYMENT_TABLE,
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
      payment_type: {
        type: DataTypes.ENUM("full", "installment"),
        allowNull: false,
        validate: { isIn: [["full", "installment"]] },
      },
      payment_method: {
        type: DataTypes.ENUM("upi", "cash", "other"),
        allowNull: false,
        validate: { isIn: [["upi", "cash", "other"]] },
      },
      amount_paid: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      remarks: {
        type: DataTypes.STRING,
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

  await TreatmentPaymentModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  return await TreatmentPaymentModel.create(
    {
      treatment_id: req.body.treatment_id,
      patient_id: req.body.patient_id,
      payment_type: req.body.payment_type,
      payment_method: req.body.payment_method,
      amount_paid: req.body.amount_paid,
      remarks: req.body.remarks,
      added_by: req.user_data.id,
    },
    { transaction }
  );
};

const get = async () => {
  return await TreatmentPaymentModel.findAll({
    order: [["created_at", "DESC"]],
  });
};

const getById = async (req, id) => {
  return await TreatmentPaymentModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id) => {
  return await TreatmentPaymentModel.update(
    {
      payment_type: req.body.payment_type,
      payment_method: req.body.payment_method,
      amount_paid: req.body.amount_paid,
      remarks: req.body.remarks,
    },
    {
      where: { id: req?.params?.id || id },
      raw: true,
    }
  );
};

const getByPatientId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.patient_id = :patientId`];
  const queryParams = { patientId: req?.params?.id || treatment_id };
  const q = req.query.q ? req.query.q : null;
  const type = req.query.type ? req.query.type.split(".") : null;
  const method = req.query.method ? req.query.method.split(".") : null;

  if (q) {
    whereConditions.push(
      `(pymnt.remarks ILIKE :query OR CAST(pymnt.amount_paid AS TEXT) ILIKE :query)`
    );
    queryParams.query = `%${String(q.trim())}%`;
  }
  if (Array.isArray(type)) {
    whereConditions.push(`pymnt.payment_type = any(:type)`);
    queryParams.type = `{${type.join(",")}}`;
  }
  if (Array.isArray(method)) {
    whereConditions.push(`pymnt.payment_method = any(:method)`);
    queryParams.method = `{${method.join(",")}}`;
  }

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      pymnt.*,
      usr.fullname as added_by
    FROM ${constants.models.PAYMENT_TABLE} pymnt
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = pymnt.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pymnt.added_by
    ${whereClause}
    ORDER BY pymnt.created_at desc
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(pymnt.id) OVER()::integer as total
      FROM ${constants.models.PAYMENT_TABLE} pymnt
      LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = pymnt.treatment_id
      LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pymnt.added_by
    ${whereClause}
  `;

  const data = await TreatmentPaymentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
      limit,
      offset,
    },
    raw: true,
  });

  const count = await TreatmentPaymentModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
    },
    raw: true,
  });

  return { payments: data, total: count?.[0]?.total ?? 0 };
};

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };
  const q = req.query.q ? req.query.q : null;
  const type = req.query.type ? req.query.type.split(".") : null;
  const method = req.query.method ? req.query.method.split(".") : null;

  if (q) {
    whereConditions.push(
      `(pymnt.remarks ILIKE :query OR CAST(pymnt.amount_paid AS TEXT) ILIKE :query)`
    );
    queryParams.query = `%${String(q.trim())}%`;
  }
  if (Array.isArray(type)) {
    whereConditions.push(`pymnt.payment_type = any(:type)`);
    queryParams.type = `{${type.join(",")}}`;
  }
  if (Array.isArray(method)) {
    whereConditions.push(`pymnt.payment_method = any(:method)`);
    queryParams.method = `{${method.join(",")}}`;
  }

  let whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      pymnt.*,
      usr.fullname as added_by
    FROM ${constants.models.PAYMENT_TABLE} pymnt
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = pymnt.treatment_id
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pymnt.added_by
    ${whereClause}
    ORDER BY pymnt.created_at desc
    LIMIT :limit OFFSET :offset
    `;

  let countQuery = `
    SELECT
        COUNT(pymnt.id) OVER()::integer as total
      FROM ${constants.models.PAYMENT_TABLE} pymnt
      LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = pymnt.treatment_id
      LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = pymnt.added_by
    ${whereClause}
  `;

  const data = await TreatmentPaymentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
      limit,
      offset,
    },
    raw: true,
  });

  const count = await TreatmentPaymentModel.sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: {
      ...queryParams,
    },
    raw: true,
  });

  return { payments: data, total: count?.[0]?.total ?? 0 };
};

const getRemainingPayment = async (req, treatment_id) => {
  let query = `
  SELECT 
    (COALESCE(tp.total_cost_sum, 0) - COALESCE(pymnt.amount_paid_sum, 0))::integer AS remaining_amount
  FROM 
    (SELECT SUM(tp.total_cost) AS total_cost_sum 
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp 
    WHERE tp.treatment_id = :treatmentId
    ) tp
  FULL OUTER JOIN 
    (SELECT SUM(pymnt.amount_paid) AS amount_paid_sum 
    FROM ${constants.models.PAYMENT_TABLE} pymnt 
    WHERE pymnt.treatment_id = :treatmentId
    ) pymnt ON true;
    `;

  const data = await TreatmentPaymentModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { treatmentId: req?.params?.id || treatment_id },
    raw: true,
    plain: true,
  });
  return { remaining_amount: data.remaining_amount };
};

const getByPk = async (req, id) => {
  return await TreatmentPaymentModel.findByPk(req?.params?.id || id);
};

const deleteById = async (req, id) => {
  return await TreatmentPaymentModel.destroy({
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
    FROM ${constants.models.PAYMENT_TABLE} py 
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

  const result = await TreatmentPaymentModel.sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return result?.[0]?.count ?? 0;
};

const paymentsSummary = async (req, id) => {
  const { year = new Date().getFullYear() } = req.query;
  const query = `
   WITH plan_data AS (
    SELECT 
      date_trunc('month', tp.created_at) AS month, 
      SUM(tp.total_cost) AS total_cost
    FROM ${constants.models.TREATMENT_PLAN_TABLE} tp
    JOIN ${constants.models.TREATMENT_TABLE} t ON t.id = tp.treatment_id
    WHERE t.clinic_id = :clinicId
    GROUP BY date_trunc('month', tp.created_at)
  ),
  payment_data AS (
    SELECT 
      date_trunc('month', p.created_at) AS month, 
      SUM(p.amount_paid) AS total_paid
    FROM ${constants.models.PAYMENT_TABLE} p
    JOIN ${constants.models.TREATMENT_TABLE} t ON t.id = p.treatment_id
    WHERE t.clinic_id = :clinicId
    GROUP BY date_trunc('month', p.created_at)
  ),
  overall AS (
    SELECT 
      (SELECT COALESCE(SUM(total_paid), 0) 
      FROM payment_data 
      WHERE month = date_trunc('month', CURRENT_DATE)
      ) AS payment_received_this_month,
      (SELECT COALESCE(SUM(total_paid), 0) 
      FROM payment_data
      ) AS total_payment_received,
      (SELECT COALESCE(SUM(total_cost), 0) 
      FROM plan_data 
      WHERE month = date_trunc('month', CURRENT_DATE)
      ) AS payment_cost_this_month,
      (SELECT COALESCE(SUM(total_cost), 0) 
      FROM plan_data
      ) AS total_cost
  ),
  months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - interval '11 months', 
      date_trunc('month', CURRENT_DATE), 
      interval '1 month'
    ) AS month
  ),
  graph_data AS (
    SELECT 
      to_char(m.month, 'Mon YYYY') AS month,
      COALESCE(pd.total_cost, 0) AS total_amount,
      COALESCE(payd.total_paid, 0) AS received_amount
    FROM months m
    LEFT JOIN plan_data pd ON pd.month = m.month
    LEFT JOIN payment_data payd ON payd.month = m.month
    ORDER BY m.month
  )
  SELECT 
    o.payment_received_this_month,
    o.total_payment_received,
    o.payment_cost_this_month,
    o.total_cost,
    (o.total_cost - o.total_payment_received) AS balance_amount,
    (
      SELECT json_agg(row_to_json(gd) ORDER BY gd.month)
      FROM graph_data gd
    ) AS graph
  FROM overall o;
`;

  const paymentsSummary = await TreatmentPaymentModel.sequelize.query(query, {
    replacements: { year, clinicId: req?.params?.id || id },
    type: QueryTypes.SELECT,
  });

  return paymentsSummary;
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
  paymentsSummary: paymentsSummary,
  getByPatientId: getByPatientId,
};
