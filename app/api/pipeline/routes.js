"use strict";
import * as service from "./service.js";
import {
  pipelineCreate,
  pipelineUpdate,
  reorderInput,
  membersInput,
  stageInput,
  uuidParam,
} from "../../validation-schema/leads-config.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

export default async function routes(fastify) {
  fastify.get("/", async (req, reply) =>
    reply.ok(
      await service.listPipelines(req.ctx, { includeArchived: req.query.include_archived === "true" }),
    ),
  );
  fastify.post("/", async (req, reply) =>
    reply
      .code(201)
      .ok(await service.createPipeline(req.ctx, pipelineCreate.parse(req.body)), {
        message: "Pipeline created.",
      }),
  );
  fastify.get("/:id", async (req, reply) => reply.ok(await service.getPipeline(req.ctx, id(req))));
  fastify.put("/:id", async (req, reply) =>
    reply.ok(await service.updatePipeline(req.ctx, id(req), pipelineUpdate.parse(req.body)), {
      message: "Pipeline updated.",
    }),
  );
  fastify.delete("/:id", async (req, reply) => {
    await service.deletePipeline(req.ctx, id(req));
    return reply.ok(null, { message: "Pipeline deleted." });
  });
  fastify.post("/:id/default", async (req, reply) => {
    await service.setDefaultPipeline(req.ctx, id(req));
    return reply.ok(null, { message: "Default pipeline set." });
  });
  fastify.post("/:id/archive", async (req, reply) => {
    await service.archivePipeline(req.ctx, id(req), true);
    return reply.ok(null, { message: "Pipeline archived." });
  });
  fastify.post("/:id/unarchive", async (req, reply) => {
    await service.archivePipeline(req.ctx, id(req), false);
    return reply.ok(null, { message: "Pipeline restored." });
  });
  fastify.put("/:id/members", async (req, reply) => {
    await service.setMembers(req.ctx, id(req), membersInput.parse(req.body).user_ids);
    return reply.ok(null, { message: "Members updated." });
  });
  fastify.post("/:id/stages", async (req, reply) =>
    reply
      .code(201)
      .ok(await service.addStage(req.ctx, id(req), stageInput.parse(req.body)), { message: "Stage added." }),
  );
  fastify.put("/:id/stages/reorder", async (req, reply) => {
    await service.reorderStages(req.ctx, id(req), reorderInput.parse(req.body).stage_ids);
    return reply.ok(null, { message: "Stages reordered." });
  });
}
