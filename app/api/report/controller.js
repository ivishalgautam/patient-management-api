"use strict";
import table from "../../db/models.js";

const get = async (req, res) => {
  try {
    const clinicId = req.params.id;
    const clinic = await table.ClinicModel.getByPk(0, clinicId);
    if (!clinic)
      return res
        .code(404)
        .send({ status: false, message: "Clinic not found!" });

    const todayAppointments = await table.BookingModel.count(clinicId, true);
    const todayPatients = await table.ClinicPatientMapModel.count(
      clinicId,
      true
    );
    const todayVisitedPatients = await table.TreatmentModel.count(
      clinicId,
      true
    );
    const todayCollection = await table.TreatmentPaymentModel.count(
      clinicId,
      true
    );
    const totalCollection = await table.TreatmentPaymentModel.count(clinicId);

    console.log({ todayCollection, totalCollection });

    const report = {
      today_appointments: todayAppointments,
      today_patients: todayPatients,
      today_visited_patients: todayVisitedPatients,
      today_collection: todayCollection,
      total_collection: totalCollection,
    };

    res.send({
      status: true,
      data: report,
    });
  } catch (error) {
    throw error;
  }
};

export default {
  get: get,
};
