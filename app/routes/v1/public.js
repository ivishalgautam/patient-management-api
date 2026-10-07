import { bannerPublicRoutes } from "../../api/banner/routes.js";
import { procedurePublicRoutes } from "../../api/procedure/routes.js";
import { servicePublicRoutes } from "../../api/service/routes.js";
import { publicFormRoutes } from "../../api/form/routes.js";
import { integrationPublicRoutes } from "../../api/integration/routes.js";
import webhookRoutes from "../../api/webhook/routes.js";
import { whatsappWebhookRoutes } from "../../api/whatsapp/routes.js";

export default async function publcRoutes(fastify, opt) {
  fastify.register(bannerPublicRoutes, { prefix: "banners" });
  fastify.register(procedurePublicRoutes, { prefix: "procedures" });
  fastify.register(servicePublicRoutes, { prefix: "services" });
  fastify.register(publicFormRoutes, { prefix: "public/forms" });
  fastify.register(integrationPublicRoutes, { prefix: "integrations" });
  fastify.register(webhookRoutes, { prefix: "webhooks" });
  fastify.register(whatsappWebhookRoutes, { prefix: "webhooks/whatsapp" });
}
