"use strict";
import { updateActivity, deleteActivity } from "../lead/service.js";
import { activityUpdate } from "../../validation-schema/lead.schema.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";

export default async function routes(fastify) {
  fastify.put("/:id", async (req, reply) =>
    reply.ok(await updateActivity(req.ctx, uuidParam.parse(req.params).id, activityUpdate.parse(req.body))),
  );
  fastify.delete("/:id", async (req, reply) => {
    await deleteActivity(req.ctx, uuidParam.parse(req.params).id);
    return reply.ok(null, { message: "Activity deleted." });
  });
}
