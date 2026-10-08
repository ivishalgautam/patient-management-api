import jwtVerify from "../../helpers/auth.js";
import { tenantGuard } from "../../middlewares/tenant-guard.js";
import { permissionGuard } from "../../middlewares/permission-guard.js";
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
import patientRoutes, {
  patientImportRoutes,
} from "../../api/patient/routes.js";
import { serviceImportRoutes } from "../../api/service/routes.js";
import reportRoutes from "../../api/report/routes.js";
import staffRoutes from "../../api/staff/routes.js";
import clinicStaffRoutes from "../../api/clinic-staff/routes.js";
import doctorRoutes from "../../api/doctor/routes.js";
import comprehensiveExaminationRoutes from "../../api/comprehensive-examination/routes.js";
import xrayRoutes from "../../api/xray/routes.js";
import documentRoutes from "../../api/document/routes.js";
import ledgerRoutes from "../../api/ledger/routes.js";
import visitRoutes from "../../api/treatment-visit/routes.js";
import jobRoutes from "../../api/job/routes.js";
import pipelineRoutes from "../../api/pipeline/routes.js";
import pipelineStageRoutes from "../../api/pipeline-stage/routes.js";
import customFieldRoutes from "../../api/custom-field/routes.js";
import tagRoutes from "../../api/tag/routes.js";
import leadRoutes from "../../api/lead/routes.js";
import leadActivityRoutes from "../../api/lead-activity/routes.js";
import formRoutes from "../../api/form/routes.js";
import integrationRoutes from "../../api/integration/routes.js";
import leadImportRoutes from "../../api/lead-import/routes.js";
import practiceFeatureRoutes from "../../api/practice-feature/routes.js";
import roleRoutes from "../../api/role/routes.js";
import notificationRoutes from "../../api/notification/routes.js";
import whatsappRoutes from "../../api/whatsapp/routes.js";
import accountsRoutes from "../../api/accounts/routes.js";
import scheduleRoutes from "../../api/schedule/routes.js";
import patientMessagesRoutes from "../../api/patient-messages/routes.js";
import inventoryRoutes from "../../api/inventory/routes.js";
import labRoutes from "../../api/lab/routes.js";

export default async function routes(fastify, options) {
  fastify.addHook("onRequest", jwtVerify.verifyToken);
  // Permission check, then practice scoping, run last, after route preHandlers (e.g. multipart
  // parsing) so body ids can be checked too. See lib/tenant-map.js.
  fastify.addHook("onRoute", (route) => {
    route.preHandler = [].concat(route.preHandler ?? [], permissionGuard, tenantGuard);
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
  fastify.register(patientImportRoutes, { prefix: "patients" });
  fastify.register(serviceImportRoutes, { prefix: "services" });
  fastify.register(reportRoutes, { prefix: "reports" });
  fastify.register(staffRoutes, { prefix: "staff" });
  fastify.register(clinicStaffRoutes, { prefix: "clinic-staff" });
  fastify.register(doctorRoutes, { prefix: "doctors" });
  fastify.register(comprehensiveExaminationRoutes, {
    prefix: "comprehensive-examinations",
  });
  fastify.register(xrayRoutes, { prefix: "x-rays" });
  fastify.register(documentRoutes, { prefix: "documents" });
  fastify.register(ledgerRoutes, { prefix: "ledgers" });
  fastify.register(visitRoutes, { prefix: "treatment-visits" });
  fastify.register(jobRoutes, { prefix: "jobs" });

  // leads module
  fastify.register(pipelineRoutes, { prefix: "pipelines" });
  fastify.register(pipelineStageRoutes, { prefix: "pipeline-stages" });
  fastify.register(customFieldRoutes, { prefix: "custom-fields" });
  fastify.register(tagRoutes, { prefix: "tags" });
  fastify.register(leadRoutes, { prefix: "leads" });
  fastify.register(leadActivityRoutes, { prefix: "lead-activities" });
  fastify.register(formRoutes, { prefix: "forms" });
  fastify.register(integrationRoutes, { prefix: "integrations" });
  fastify.register(leadImportRoutes, { prefix: "lead-imports" });
  fastify.register(practiceFeatureRoutes, { prefix: "practice-features" });
  fastify.register(roleRoutes, { prefix: "roles" });
  fastify.register(notificationRoutes, { prefix: "notifications" });
  fastify.register(whatsappRoutes, { prefix: "whatsapp" });
  fastify.register(accountsRoutes, { prefix: "accounts" });
  fastify.register(scheduleRoutes, { prefix: "schedule" });
  fastify.register(patientMessagesRoutes, { prefix: "patient-messages" });
  fastify.register(inventoryRoutes, { prefix: "inventory" });
  fastify.register(labRoutes, { prefix: "lab" });
}
