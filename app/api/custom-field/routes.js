"use strict";
import * as service from "./service.js";
import {
  customFieldCreate,
  customFieldUpdate,
  uuidParam,
} from "../../validation-schema/leads-config.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

export default async function routes(fastify) {
  fastify.get("/", async (req, reply) =>
    reply.ok(
      await service.listCustomFields(req.ctx, { includeArchived: req.query.include_archived === "true" }),
    ),
  );
  fastify.post("/", async (req, reply) =>
    reply
      .code(201)
      .ok(await service.createCustomField(req.ctx, customFieldCreate.parse(req.body)), {
        message: "Custom field created.",
      }),
  );
  fastify.put("/:id", async (req, reply) =>
    reply.ok(await service.updateCustomField(req.ctx, id(req), customFieldUpdate.parse(req.body)), {
      message: "Custom field updated.",
    }),
  );
  fastify.post("/:id/archive", async (req, reply) => {
    await service.archiveCustomField(req.ctx, id(req), true);
    return reply.ok(null, { message: "Custom field archived." });
  });
  fastify.post("/:id/unarchive", async (req, reply) => {
    await service.archiveCustomField(req.ctx, id(req), false);
    return reply.ok(null, { message: "Custom field restored." });
  });
}
