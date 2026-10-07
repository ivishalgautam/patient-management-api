"use strict";
import * as service from "./service.js";
import {
  activityCreate,
  assignInput,
  bulkInput,
  duplicateQuery,
  leadCreate,
  leadUpdate,
  listQuery,
  moveInput,
} from "../../validation-schema/lead.schema.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => {
    const result = await service.listLeads(req.ctx, listQuery.parse(req.query), req.query);
    return result.leads ? reply.ok(result.leads, { meta: result.meta }) : reply.ok(result);
  });
  fastify.post("/", async (req, reply) => {
    const { lead } = await service.createLead(req.ctx, leadCreate.parse(req.body));
    return reply.code(201).ok(await service.getLead(req.ctx, lead.id), { message: "Lead created." });
  });
  fastify.get("/duplicates", async (req, reply) =>
    reply.ok(await service.findDuplicates(req.ctx.practiceId, duplicateQuery.parse(req.query))),
  );
  fastify.get("/follow-ups/due", async (req, reply) => reply.ok(await service.dueFollowUps(req.ctx)));
  fastify.post("/bulk", async (req, reply) => reply.ok(await service.bulk(req.ctx, bulkInput.parse(req.body))));

  fastify.get("/:id", async (req, reply) => reply.ok(await service.getLead(req.ctx, id(req))));
  fastify.put("/:id", async (req, reply) => {
    await service.updateLead(req.ctx, id(req), leadUpdate.parse(req.body));
    return reply.ok(await service.getLead(req.ctx, id(req)), { message: "Lead updated." });
  });
  fastify.delete("/:id", async (req, reply) => {
    await service.deleteLead(req.ctx, id(req));
    return reply.ok(null, { message: "Lead deleted." });
  });
  fastify.post("/:id/move", async (req, reply) => {
    await service.moveLead(req.ctx, id(req), moveInput.parse(req.body));
    return reply.ok(await service.getLead(req.ctx, id(req)), { message: "Lead moved." });
  });
  fastify.post("/:id/assign", async (req, reply) => {
    await service.assignLead(req.ctx, id(req), assignInput.parse(req.body).owner_id);
    return reply.ok(await service.getLead(req.ctx, id(req)), { message: "Lead assigned." });
  });
  fastify.get("/:id/timeline", async (req, reply) => reply.ok(await service.timeline(req.ctx, id(req))));
  fastify.post("/:id/activities", async (req, reply) =>
    reply.code(201).ok(await service.createActivity(req.ctx, id(req), activityCreate.parse(req.body))),
  );
}
