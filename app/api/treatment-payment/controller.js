"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import { treatmentPaymentSchema } from "../../validation-schemas/treatment.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const validate = treatmentPaymentSchema.parse(req.body);

    const treatment = await table.TreatmentModel.getByPk(
      0,
      req.body.treatment_id
    );

    if (!treatment) {
      await transaction.rollback();
      return res.code(404).send({
        status: false,
        message: "Treatment not found.",
      });
    }

    const remainingCost =
      await table.TreatmentPlanModel.countRemainingCostByTreatmentId(
        req.body.treatment_id,
        { transaction }
      );

    if (!remainingCost) {
      await transaction.rollback();
      return res.status(400).send({
        status: false,
        message: "No remaining balance!",
      });
    }

    const amountPaid = req.body.amount_paid || 0;
    const advanceUsed = req.body.advance_used || 0;

    const totalPayment = amountPaid + advanceUsed;

    if (remainingCost < totalPayment) {
      await transaction.rollback();
      return res.status(400).send({
        status: false,
        message: `Remaining balance is ${remainingCost}`,
      });
    }

    /* ---------------- check ledger balance ---------------- */

    const ledgerBalance =
      await table.LedgerModel.ledgerBalanceByClinicAndPatient(
        0,
        req.body.clinic_id,
        treatment.patient_id
      );

    if (advanceUsed > ledgerBalance) {
      await transaction.rollback();
      return res.status(400).send({
        status: false,
        message: "Advance balance exceeded",
      });
    }

    /* ---------------- create payment ---------------- */

    const data = await table.TreatmentPaymentModel.create(
      {
        ...req,
        body: {
          treatment_id: req.body.treatment_id,
          payment_type: req.body.payment_type,
          payment_method: req.body.payment_method,
          amount_paid: amountPaid,
          advance_used: advanceUsed,
          remarks: req.body.remarks,
        },
      },
      { transaction }
    );

    /* ---------------- ledger entries ---------------- */
    // if (amountPaid > 0) {
    //   await table.LedgerModel.create(
    //     {
    //       body: {
    //         clinic_id: req.body.clinic_id,
    //         patient_id: treatment.patient_id,
    //         reference_type: "treatment_payment",
    //         entry_type: "credit",
    //         amount: amountPaid,
    //         description: "Treatment payment",
    //       },
    //       user_data: req.user_data,
    //     },
    //     transaction
    //   );
    // }

    if (advanceUsed > 0) {
      await table.LedgerModel.create(
        {
          body: {
            clinic_id: req.body.clinic_id,
            service_id: req.body.service_id,
            patient_id: treatment.patient_id,
            reference_type: "adjustment",
            entry_type: "debit",
            amount: advanceUsed,
            description: "Advance used for treatment",
          },
          user_data: req.user_data,
        },
        transaction
      );
    }

    await transaction.commit();

    res.send({
      status: true,
      data,
      message: "Treatment payment created.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentPaymentModel.update(req),
      message: "Treatment payment updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.TreatmentPaymentModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });
    }

    res.send({
      status: true,
      data: await table.TreatmentPaymentModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByTreatmentId = async (req, res) => {
  try {
    const treatment = await table.TreatmentModel.getByPk(req);
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const record = await table.TreatmentPaymentModel.getByTreatmentId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByPatientId = async (req, res) => {
  try {
    const patient = await table.PatientModel.getById(req);
    if (!patient)
      return res
        .code(404)
        .send({ status: false, message: "Patient not found." });

    const record = await table.TreatmentPaymentModel.getByPatientId(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getRemainingPayment = async (req, res) => {
  try {
    const treatment = await table.TreatmentModel.getByPk(req);
    if (!treatment)
      return res
        .code(404)
        .send({ status: false, message: "Treatment not found." });

    const record = await table.TreatmentPaymentModel.getRemainingPayment(req);

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const patient = await table.PatientModel.getByUserId(req.user_data.id);

    const data = await table.TreatmentPaymentModel.getByPatientId(
      req,
      patient.id
    );
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });

    const isTreatmentDeleted = await table.TreatmentPaymentModel.deleteById(
      req,
      0,
      {
        transaction,
      }
    );

    await transaction.commit();
    res.send({ status: true, message: "Treatment payment deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const accounts = async (req, res) => {
  try {
    const data = await table.TreatmentPaymentModel.paymentsSummary(req);

    res.send(data);
  } catch (error) {
    throw error;
  }
};

export default {
  create: create,
  get: get,
  updateById: updateById,
  deleteById: deleteById,
  getBySlug: getBySlug,
  getById: getById,
  getByTreatmentId: getByTreatmentId,
  getRemainingPayment: getRemainingPayment,
  accounts: accounts,
  getByPatientId: getByPatientId,
};
