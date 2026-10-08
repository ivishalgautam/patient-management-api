"use strict";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import { itemInput, itemQuery, itemUpdate, movementInput, reportQuery, supplierInput, supplierUpdate } from "../../validation-schema/inventory-lab.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/inventory
export default async function routes(fastify) {
  fastify.get("/categories", async (req, reply) => reply.ok(service.CATEGORIES));

  fastify.get("/suppliers", async (req, reply) => reply.ok(await service.listSuppliers(req.ctx, { includeArchived: req.query?.include_archived === "true" })));
  fastify.post("/suppliers", async (req, reply) =>
    reply.code(201).ok(await service.createSupplier(req.ctx, supplierInput.parse(req.body)), { message: "Supplier added." }),
  );
  fastify.put("/suppliers/:id", async (req, reply) =>
    reply.ok(await service.updateSupplier(req.ctx, id(req), supplierUpdate.parse(req.body)), { message: "Supplier saved." }),
  );

  fastify.get("/items", async (req, reply) => reply.ok(await service.listItems(req.ctx, itemQuery.parse(req.query ?? {}))));
  fastify.post("/items", async (req, reply) => reply.code(201).ok(await service.createItem(req.ctx, itemInput.parse(req.body)), { message: "Item added." }));
  fastify.put("/items/:id", async (req, reply) => reply.ok(await service.updateItem(req.ctx, id(req), itemUpdate.parse(req.body)), { message: "Item saved." }));
  fastify.get("/items/:id/movements", async (req, reply) => reply.ok(await service.listMovements(req.ctx, id(req))));
  fastify.post("/items/:id/movements", async (req, reply) =>
    reply.code(201).ok(await service.recordMovement(req.ctx, id(req), movementInput.parse(req.body)), { message: "Stock updated." }),
  );

  fastify.get("/report", async (req, reply) => reply.ok(await service.inventoryReport(req.ctx, reportQuery.parse(req.query ?? {}))));
}
