"use strict";
import { beginTransaction } from "../../db/transaction.js";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import { treatmentPaymentSchema, treatmentPaymentUpdateSchema } from "../../validation-schema/treatment.schema.js";
import { badRequest } from "../../lib/app-error.js";
import { assertAmount } from "../../lib/booking-rules.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const validate = treatmentPaymentSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validate);

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
    // The advance is taken from the treatment's clinic ledger, never another.
    if (req.body.clinic_id !== treatment.clinic_id) {
      throw badRequest("The payment's clinic must be the treatment's clinic.");
    }
    assertAmount(req.body.amount_paid ?? 0, "Amount paid");
    assertAmount(req.body.advance_used ?? 0, "Advance used");
    if (!(req.body.amount_paid ?? 0) && !(req.body.advance_used ?? 0)) {
      throw badRequest("Enter the amount paid or the advance used.");
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
            service_id: treatment.service_id,
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
  const record = await table.TreatmentPaymentModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment payment not found!" });
  }
  const changes = treatmentPaymentUpdateSchema.parse(req.body ?? {});
  if ("advance_used" in (req.body ?? {}) && req.body.advance_used !== record.advance_used) {
    throw badRequest("The advance used can't be changed. Delete the payment and record it again.");
  }
  if (changes.amount_paid !== undefined) {
    assertAmount(changes.amount_paid, "Amount paid");
    if (!changes.amount_paid && !record.advance_used) throw badRequest("Enter the amount paid.");
    // Same rule as recording a payment, with this payment's old amount
    // given back to the balance first.
    const remaining = await table.TreatmentPlanModel.countRemainingCostByTreatmentId(record.treatment_id, {});
    const available = (remaining ?? 0) + (record.amount_paid ?? 0);
    if (changes.amount_paid + (record.advance_used ?? 0) > available) {
      throw badRequest(`Remaining balance is ${available - (record.advance_used ?? 0)}`);
    }
  }
  req.body = changes;

  res.send({
    status: true,
    data: await table.TreatmentPaymentModel.update(req),
    message: "Treatment payment updated.",
  });
};

const getBySlug = async (req, res) => {
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
};

const getById = async (req, res) => {
  const record = await table.TreatmentPaymentModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Treatment payment not found!" });
  }

  res.send({ status: true, data: record });
};

const getByTreatmentId = async (req, res) => {
  const treatment = await table.TreatmentModel.getByPk(req);
  if (!treatment)
    return res
      .code(404)
      .send({ status: false, message: "Treatment not found." });

  const record = await table.TreatmentPaymentModel.getByTreatmentId(req);

  res.send({ status: true, data: record });
};

const getByPatientId = async (req, res) => {
  const patient = await table.PatientModel.getById(req);
  if (!patient)
    return res
      .code(404)
      .send({ status: false, message: "Patient not found." });

  const record = await table.TreatmentPaymentModel.getByPatientId(req);

  res.send({ status: true, data: record });
};

const getRemainingPayment = async (req, res) => {
  const treatment = await table.TreatmentModel.getByPk(req);
  if (!treatment)
    return res
      .code(404)
      .send({ status: false, message: "Treatment not found." });

  const record = await table.TreatmentPaymentModel.getRemainingPayment(req);

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  const patient = await table.PatientModel.getByUserId(req.user_data.id);

  const data = await table.TreatmentPaymentModel.getByPatientId(
    req,
    patient.id
  );
  res.send({ status: true, data: data, total: data?.[0]?.total });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);

  try {
    const record = await table.TreatmentPaymentModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Treatment payment not found!" });

    await table.TreatmentPaymentModel.deleteById(
      req,
      0,
      {
        transaction,
      }
    );

    // The advance this payment used goes back to the patient's balance.
    if (record.advance_used > 0) {
      const treatment = await table.TreatmentModel.getByPk(0, record.treatment_id);
      await table.LedgerModel.create(
        {
          body: {
            clinic_id: treatment.clinic_id,
            service_id: treatment.service_id,
            patient_id: treatment.patient_id,
            reference_type: "adjustment",
            entry_type: "credit",
            amount: record.advance_used,
            description: "Advance returned (payment deleted)",
          },
          user_data: req.user_data,
        },
        transaction
      );
    }

    await transaction.commit();
    res.send({ status: true, message: "Treatment payment deleted." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const accounts = async (req, res) => {
  const data = await table.TreatmentPaymentModel.paymentsSummary(req);

  res.send(data);
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
