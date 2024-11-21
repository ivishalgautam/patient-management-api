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

export default async function routes(fastify, options) {
  fastify.addHook("onRequest", jwtVerify.verifyToken);
  fastify.addHook("preHandler", async (request, reply) => {
    request.body && console.log("body", request.body);
  });
  fastify.register(userRoutes, { prefix: "users" });
  fastify.register(procedureRoutes, { prefix: "procedures" });
  fastify.register(serviceRoutes, { prefix: "services" });
  fastify.register(bannerRoutes, { prefix: "banners" });
  fastify.register(treatmentRoutes, { prefix: "treatments" });
  fastify.register(treatmentHistoryRoutes, { prefix: "treatment-history" });
  fastify.register(treatmentPlanRoutes, { prefix: "treatment-plan" });
  fastify.register(treatmentPrescriptionRoutes, {
    prefix: "treatment-prescription",
  });
  fastify.register(clinicRoutes, { prefix: "clinics" });
  fastify.register(slotRoutes, { prefix: "slots" });
  fastify.register(blockSlotRoutes, { prefix: "block-slots" });
  fastify.register(doctorServiceRoutes, { prefix: "doctor-services" });
  fastify.register(bookingRoutes, { prefix: "bookings" });
}
