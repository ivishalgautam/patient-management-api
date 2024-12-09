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
      payment_type: req.body.payment_type,
      payment_method: req.body.payment_method,
      amount_paid: req.body.amount_paid,
      remarks: req.body.remarks,
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

const getByTreatmentId = async (req, treatment_id) => {
  const whereConditions = [`trmnt.id = :treatmentId`];
  const queryParams = { treatmentId: req?.params?.id || treatment_id };
  const q = req.query.q ? req.query.q : null;
  if (false && q) {
    whereConditions.push(``);
    queryParams.q = `%${q.trim()}%`;
  }
  let whereClause = "";
  if (whereConditions.length) {
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;
  }
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let query = `
  SELECT
      pymnt.*
    FROM ${constants.models.PAYMENT_TABLE} pymnt
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = pymnt.treatment_id
    ${whereClause}
    ORDER BY pymnt.created_at desc
    LIMIT :limit OFFSET :offset
  `;

  let countQuery = `
  SELECT
      COUNT(pymnt.id) OVER()::integer as total
    FROM ${constants.models.PAYMENT_TABLE} pymnt
    LEFT JOIN ${constants.models.TREATMENT_TABLE} trmnt ON trmnt.id = pymnt.treatment_id
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

  console.log({ result });

  return result?.[0]?.count;
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
  count: count,
};
