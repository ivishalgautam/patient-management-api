"use strict";
import { updateStage, deleteStage } from "../pipeline/service.js";
import { stageInput, uuidParam } from "../../validation-schema/leads-config.schema.js";

export default async function routes(fastify) {
  fastify.put("/:id", async (req, reply) =>
    reply.ok(
      await updateStage(req.ctx, uuidParam.parse(req.params).id, stageInput.partial().parse(req.body)),
      { message: "Stage updated." },
    ),
  );
  fastify.delete("/:id", async (req, reply) => {
    await deleteStage(req.ctx, uuidParam.parse(req.params).id);
    return reply.ok(null, { message: "Stage deleted." });
  });
}
