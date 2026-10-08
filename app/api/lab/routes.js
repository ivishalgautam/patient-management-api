"use strict";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import { labInput, labUpdate, orderInput, orderQuery, orderUpdate, paidInput, statusInput } from "../../validation-schema/inventory-lab.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/lab
export default async function routes(fastify) {
  fastify.get("/work-types", async (req, reply) => reply.ok(service.WORK_TYPES));

  fastify.get("/labs", async (req, reply) => reply.ok(await service.listLabs(req.ctx, { includeArchived: req.query?.include_archived === "true" })));
  fastify.post("/labs", async (req, reply) => reply.code(201).ok(await service.createLab(req.ctx, labInput.parse(req.body)), { message: "Lab added." }));
  fastify.put("/labs/:id", async (req, reply) => reply.ok(await service.updateLab(req.ctx, id(req), labUpdate.parse(req.body)), { message: "Lab saved." }));

  fastify.get("/orders", async (req, reply) => {
    const { orders, meta } = await service.listOrders(req.ctx, orderQuery.parse(req.query ?? {}));
    return reply.ok(orders, { meta });
  });
  fastify.post("/orders", async (req, reply) =>
    reply.code(201).ok(await service.createOrder(req.ctx, orderInput.parse(req.body)), { message: "Lab order created." }),
  );
  fastify.get("/orders/:id", async (req, reply) => reply.ok(await service.getOrder(req.ctx, id(req))));
  fastify.put("/orders/:id", async (req, reply) => reply.ok(await service.updateOrder(req.ctx, id(req), orderUpdate.parse(req.body)), { message: "Saved." }));
  fastify.post("/orders/:id/status", async (req, reply) => reply.ok(await service.changeStatus(req.ctx, id(req), statusInput.parse(req.body)), { message: "Updated." }));
  fastify.post("/orders/:id/paid", async (req, reply) =>
    reply.ok(await service.markPaid(req.ctx, id(req), paidInput.parse(req.body ?? {})), { message: "Lab bill marked paid." }),
  );
}
