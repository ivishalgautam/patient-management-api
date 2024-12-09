"use strict";
import userModel from "./models/user.model.js";
import doctorModel from "./models/doctor.model.js";
import patientModel from "./models/patient.model.js";
import procedureModel from "./models/procedure.model.js";
import serviceModel from "./models/service.model.js";
import slotModel from "./models/slot.model.js";
import bannerModel from "./models/banner.model.js";
import treatmentModel from "./models/treatment.model.js";
import treatmentHistoryModel from "./models/treatment-history.model.js";
import treatmentPlanModel from "./models/treatment-plan.model.js";
import treatmentPrescriptionModel from "./models/treatment-prescription.model.js";
import clinicModel from "./models/clinic.model.js";
import clinicPatientMapModel from "./models/clinic-patient-map.model.js";
import blockedSlotModel from "./models/blocked-slot.model.js";
import doctorServiceMapModel from "./models/doctor-service-map.model.js";
import bookingModel from "./models/booking.model.js";
import doctorPatientMapModel from "./models/doctor-patient-map.model.js";
import dentalChartModel from "./models/dental-chart.model.js";
import dentalNoteModel from "./models/dental-note.model.js";
import investigationModel from "./models/investigation.model.js";
import treatmentPaymentModel from "./models/treatment-payment.model.js";

export default {
  UserModel: userModel,
  DoctorModel: doctorModel,
  ClinicModel: clinicModel,
  PatientModel: patientModel,
  ClinicPatientMapModel: clinicPatientMapModel,
  DoctorPatientMapModel: doctorPatientMapModel,
  ProcedureModel: procedureModel,
  ServiceModel: serviceModel,
  SlotModel: slotModel,
  BlockedSlotModel: blockedSlotModel,
  BannerModel: bannerModel,
  TreatmentModel: treatmentModel,
  TreatmentHistoryModel: treatmentHistoryModel,
  TreatmentPlanModel: treatmentPlanModel,
  TreatmentPrescriptionModel: treatmentPrescriptionModel,
  DoctorServiceMapModel: doctorServiceMapModel,
  BookingModel: bookingModel,
  DentalChartModel: dentalChartModel,
  DentalNoteModel: dentalNoteModel,
  InvestigationModel: investigationModel,
  TreatmentPaymentModel: treatmentPaymentModel,
};
