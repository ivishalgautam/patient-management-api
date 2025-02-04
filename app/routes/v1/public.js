import { bannerPublicRoutes } from "../../api/banner/routes.js";
import { procedurePublicRoutes } from "../../api/procedure/routes.js";
import { servicePublicRoutes } from "../../api/service/routes.js";

export default async function publcRoutes(fastify, opt) {
  fastify.register(bannerPublicRoutes, { prefix: "banners" });
  fastify.register(procedurePublicRoutes, { prefix: "procedures" });
  fastify.register(servicePublicRoutes, { prefix: "services" });
}
