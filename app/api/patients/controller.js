"use strict";
import table from "../../db/models.js";
import { handleExcelImport } from "../../utils/import-excel.js";
import hash from "../../lib/encryption/index.js";
import { sequelize } from "../../db/postgres.js";
import config from "../../config/index.js";
import slugify from "slugify";
import constants from "../../lib/constants/index.js";

const get = async (req, res) => {
  try {
    res.send({ status: true, data: await table.PatientModel.get(req) });
  } catch (error) {
    throw error;
  }
};

const importPatients = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const parts = req.parts();
    const patientData = [];

    for await (const part of parts) {
      if (part.file) {
        const data = await handleExcelImport(part);

        let currentPatient = null;
        for (const patient of data) {
          if (patient.patient_id) {
            if (currentPatient) patientData.push(currentPatient);

            currentPatient = {
              patient_id: patient.patient_id,
              fullname: patient.fullname,
              mobile_number: patient.mobile_number,
              gender: patient.gender,
              treatments: [
                {
                  date: patient.date,
                  treatment: patient.treatment,
                  cost: patient.cost,
                },
              ],
            };
          } else if (currentPatient) {
            currentPatient.treatments.push({
              date: patient.date,
              treatment: patient.treatment,
              cost: patient.cost,
            });
          }
        }

        if (currentPatient) {
          patientData.push(currentPatient);
        }
      }
    }

    const grouped = Object.groupBy(
      patientData,
      ({ mobile_number }) => mobile_number,
    );

    const object = {};
    for (const [mobile_number, data] of Object.entries(grouped)) {
      if (data.length > 1) {
        object[mobile_number] = data.map((d) => d.patient_id);
      }
    }

    return object;

    const promises = patientData.map(async (user) => {
      console.log(
        "patient_id",
        user.patient_id,
        "mobile_number",
        user.mobile_number,
      );
      const username = `ddss${user.patient_id}`;
      const password =
        String(user.fullname.substring(0, 4)).toLowerCase() +
        user.mobile_number.slice(-4);

      const payload = {
        username: username,
        password: password,
        fullname: user.fullname,
        country_code: "91",
        mobile_number: user.mobile_number,
        gender: user.gender === "f" ? "female" : "male",
        role: "patient",
      };

      const userRecord = await table.UserModel.getByUsername({
        body: { username },
      });
      if (userRecord) {
        const patientRecord = await table.PatientModel.getByUserId(
          userRecord.id,
        );
        if (patientRecord) {
          let clinicPatientRecord =
            await table.ClinicPatientMapModel.getByClinicPatientId(
              patientRecord.id,
              config.clinic_id,
            );
          if (!clinicPatientRecord) {
            clinicPatientRecord = await table.ClinicPatientMapModel.create(
              patientRecord.id,
              config.clinic_id,
              { transaction },
            );

            const services = user.treatments.filter(Boolean);
            for (const service of services) {
              const slug = slugify(String(service.treatment).trim(), {
                lower: true,
                strict: true,
              });
              const serviceRecord = await table.ServiceModel.getBySlug(0, slug);
              if (!serviceRecord) throw new Error("Service not found");

              const treatmentRecord = await table.TreatmentModel.create(
                { user_data: { id: config.doctor_user_id } },
                {
                  clinic_id: config.clinic_id,
                  patient_id: patientRecord.id,
                  service_id: serviceRecord.id,
                  added_by: config.doctor_user_id,
                  status: "close",
                },
                { transaction },
              );
              const treatmentPlanRecord = await table.TreatmentPlanModel.create(
                {
                  user_data: { id: config.doctor_user_id },
                  body: {
                    treatment_id: treatmentRecord.id,
                    patient_id: patientRecord.id,
                    affected_tooths: [
                      // {
                      //   tooth: Math.floor(Math.random() * 32),
                      //   color:
                      //     constants.toothColors[Math.floor(Math.random() * 4)],
                      // },
                    ],
                    total_cost: service.cost,
                  },
                },
                { transaction },
              );
              const remainingCost =
                await table.TreatmentPlanModel.countRemainingCostByTreatmentId(
                  treatmentRecord.id,
                  { transaction },
                );
              if (remainingCost) {
                const paymentRecord = await table.TreatmentPaymentModel.create(
                  {
                    user_data: { id: config.doctor_user_id },
                    body: {
                      treatment_id: treatmentRecord.id,
                      payment_type: "full",
                      payment_method: "cash",
                      amount_paid: service.cost,
                    },
                  },
                  { transaction },
                );
              }
            }
          }

          const services = user.treatments.filter(Boolean);
          for (const service of services) {
            const slug = slugify(String(service.treatment).trim(), {
              lower: true,
              strict: true,
            });
            const serviceRecord = await table.ServiceModel.getBySlug(0, slug);
            if (!serviceRecord) throw new Error("Service not found");
            const treatmentRecord = await table.TreatmentModel.create(
              { user_data: { id: config.doctor_user_id } },
              {
                clinic_id: config.clinic_id,
                patient_id: patientRecord.id,
                service_id: serviceRecord.id,
                added_by: config.doctor_user_id,
                status: "close",
              },
              { transaction },
            );
            const treatmentPlanRecord = await table.TreatmentPlanModel.create(
              {
                user_data: { id: config.doctor_user_id },
                body: {
                  treatment_id: treatmentRecord.id,
                  patient_id: patientRecord.id,
                  affected_tooths: [],
                  total_cost: service.cost,
                },
              },
              { transaction },
            );
            const remainingCost =
              await table.TreatmentPlanModel.countRemainingCostByTreatmentId(
                treatmentRecord.id,
                { transaction },
              );
            if (remainingCost) {
              const paymentRecord = await table.TreatmentPaymentModel.create(
                {
                  user_data: { id: config.doctor_user_id },
                  body: {
                    treatment_id: treatmentRecord.id,
                    payment_type: "full",
                    payment_method: "cash",
                    amount_paid: service.cost,
                  },
                },
                { transaction },
              );
            }
          }
        } else {
          const patientRecord = await table.PatientModel.create(
            { body: {} },
            userRecord.id,
            { transaction },
          );
          await table.ClinicPatientMapModel.create(
            patientRecord.id,
            config.clinic_id,
            { transaction },
          );
          const services = user.treatments.filter(Boolean);
          for (const service of services) {
            const slug = slugify(String(service.treatment).trim(), {
              lower: true,
              strict: true,
            });
            const serviceRecord = await table.ServiceModel.getBySlug(0, slug);
            if (!serviceRecord) throw new Error("Service not found");
            const treatmentRecord = await table.TreatmentModel.create(
              { user_data: { id: config.doctor_user_id } },
              {
                clinic_id: config.clinic_id,
                patient_id: patientRecord.id,
                service_id: serviceRecord.id,
                added_by: config.doctor_user_id,
                status: "close",
              },
              { transaction },
            );
            const treatmentPlanRecord = await table.TreatmentPlanModel.create(
              {
                user_data: { id: config.doctor_user_id },
                body: {
                  treatment_id: treatmentRecord.id,
                  patient_id: patientRecord.id,
                  affected_tooths: [],
                  total_cost: Math.floor(
                    Number(user.amount_paid) / services.length,
                  ),
                },
              },
              { transaction },
            );
            const remainingCost =
              await table.TreatmentPlanModel.countRemainingCostByTreatmentId(
                treatmentRecord.id,
                { transaction },
              );
            if (remainingCost) {
              const paymentRecord = await table.TreatmentPaymentModel.create(
                {
                  user_data: { id: config.doctor_user_id },
                  body: {
                    treatment_id: treatmentRecord.id,
                    payment_type: "full",
                    payment_method: "cash",
                    amount_paid: service.cost,
                  },
                },
                { transaction },
              );
            }
          }
        }
      } else {
        const newUserRecord = await table.UserModel.create(
          { body: payload },
          { transaction },
        );
        const newPatientRecord = await table.PatientModel.create(
          { body: {} },
          newUserRecord.id,
          { transaction },
        );
        const newClinicPatientMapRecord =
          await table.ClinicPatientMapModel.create(
            newPatientRecord.id,
            config.clinic_id,
            { transaction },
          );

        const services = user.treatments.filter(Boolean);
        for (const service of services) {
          const slug = slugify(String(service.treatment).trim(), {
            lower: true,
            strict: true,
          });
          const serviceRecord = await table.ServiceModel.getBySlug(0, slug);
          if (!serviceRecord) throw new Error("Service not found");

          const treatmentRecord = await table.TreatmentModel.create(
            { user_data: { id: config.doctor_user_id } },
            {
              clinic_id: config.clinic_id,
              patient_id: newPatientRecord.id,
              service_id: serviceRecord.id,
              added_by: config.doctor_user_id,
              status: "close",
            },
            { transaction },
          );

          const treatmentPlanRecord = await table.TreatmentPlanModel.create(
            {
              user_data: { id: config.doctor_user_id },
              body: {
                treatment_id: treatmentRecord.id,
                patient_id: newPatientRecord.id,
                affected_tooths: [],
                total_cost: service.cost,
              },
            },
            { transaction },
          );

          const remainingCost =
            await table.TreatmentPlanModel.countRemainingCostByTreatmentId(
              treatmentRecord.id,
              { transaction },
            );
          if (remainingCost) {
            const paymentRecord = await table.TreatmentPaymentModel.create(
              {
                user_data: { id: config.doctor_user_id },
                body: {
                  treatment_id: treatmentRecord.id,
                  payment_type: "full",
                  payment_method: "cash",
                  amount_paid: service.cost,
                },
              },
              { transaction },
            );
          }
        }
      }
    });

    const data = await Promise.all(promises);
    // await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  get: get,
  importPatients: importPatients,
};
