import jwtVerify from "../../helpers/auth.js";
import userRoutes from "../../api/users/routes.js";
import procedureRoutes from "../../api/procedure/routes.js";
import serviceRoutes from "../../api/service/routes.js";
import bannerRoutes from "../../api/banner/routes.js";
import treatmentRoutes from "../../api/treatment/routes.js";
import treatmentHistoryRoutes from "../../api/treatment-history/routes.js";
import treatmentPlanRoutes from "../../api/treatment-plan/routes.js";
import treatmentPrescriptionRoutes from "../../api/treatment-prescription/routes.js";
import clinicRoutes from "../../api/clinic/routes.js";
import slotRoutes from "../../api/slot/routes.js";
import blockSlotRoutes from "../../api/block-slot/routes.js";
import doctorServiceRoutes from "../../api/doctor-service/routes.js";
import bookingRoutes from "../../api/booking/routes.js";
import clinicPatientRoutes from "../../api/clinic-patient/routes.js";
import noteRoutes from "../../api/note/routes.js";
import investigationRoutes from "../../api/investigation/routes.js";
import treatmentPaymentRoutes from "../../api/treatment-payment/routes.js";
import patientRoutes from "../../api/patients/routes.js";
import reportRoutes from "../../api/report/routes.js";
import staffRoutes from "../../api/staff/routes.js";
import clinicStaffRoutes from "../../api/clinic-staff/routes.js";
import doctorRoutes from "../../api/doctor/routes.js";
import comprehensiveExaminationRoutes from "../../api/comprehensive-examination/routes.js";
import xrayRoutes from "../../api/xray/routes.js";
import documentRoutes from "../../api/document/routes.js";

export default async function routes(fastify, options) {
  fastify.addHook("onRequest", jwtVerify.verifyToken);
  fastify.addHook("preHandler", async (request, reply) => {
    request.body && console.log("body", request.body);
  });
  // fastify.addHook("onSend", async (request, reply, payload) => {
  //   console.log({ response: payload }, "Response payload");
  //   // return payload;
  // });
  fastify.register(userRoutes, { prefix: "users" });
  fastify.register(procedureRoutes, { prefix: "procedures" });
  fastify.register(serviceRoutes, { prefix: "services" });
  fastify.register(bannerRoutes, { prefix: "banners" });
  fastify.register(treatmentRoutes, { prefix: "treatments" });
  fastify.register(treatmentHistoryRoutes, { prefix: "treatment-history" });
  fastify.register(treatmentPlanRoutes, { prefix: "treatment-plans" });
  fastify.register(treatmentPrescriptionRoutes, {
    prefix: "treatment-prescriptions",
  });
  fastify.register(clinicRoutes, { prefix: "clinics" });
  fastify.register(slotRoutes, { prefix: "slots" });
  fastify.register(blockSlotRoutes, { prefix: "block-slots" });
  fastify.register(doctorServiceRoutes, { prefix: "doctor-services" });
  fastify.register(bookingRoutes, { prefix: "bookings" });
  fastify.register(clinicPatientRoutes, { prefix: "clinic-patients" });
  fastify.register(noteRoutes, { prefix: "notes" });
  fastify.register(investigationRoutes, { prefix: "investigations" });
  fastify.register(treatmentPaymentRoutes, { prefix: "treatment-payments" });
  fastify.register(patientRoutes, { prefix: "patients" });
  fastify.register(reportRoutes, { prefix: "reports" });
  fastify.register(staffRoutes, { prefix: "staff" });
  fastify.register(clinicStaffRoutes, { prefix: "clinic-staff" });
  fastify.register(doctorRoutes, { prefix: "doctors" });
  fastify.register(comprehensiveExaminationRoutes, {
    prefix: "comprehensive-examinations",
  });
  fastify.register(xrayRoutes, { prefix: "x-rays" });
  fastify.register(documentRoutes, { prefix: "documents" });
}
