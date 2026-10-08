"use strict";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import { audienceInput, broadcastInput, kindParam, messageQuery, retryInput, ruleInput } from "../../validation-schema/patient-messages.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/patient-messages
export default async function routes(fastify) {
  fastify.get("/settings", async (req, reply) => reply.ok(await service.getSettings(req.ctx)));
  fastify.put("/settings/:kind", async (req, reply) =>
    reply.ok(await service.saveRule(req.ctx, kindParam.parse(req.params).kind, ruleInput.parse(req.body)), { message: "Saved." }),
  );
  fastify.get("/settings/:kind/preview", async (req, reply) => reply.ok(await service.preview(req.ctx, kindParam.parse(req.params).kind)));
  fastify.post("/run-now", async (req, reply) => {
    const result = await service.runNow(req.ctx);
    return reply.ok(result, { message: result.queued ? `${result.queued} message(s) queued.` : "Nobody is due today." });
  });

  fastify.post("/audience", async (req, reply) => reply.ok(await service.audienceCount(req.ctx, audienceInput.parse(req.body ?? {}))));
  fastify.get("/broadcasts", async (req, reply) => reply.ok(await service.listBroadcasts(req.ctx)));
  fastify.post("/broadcasts", async (req, reply) =>
    reply.code(201).ok(await service.createBroadcast(req.ctx, broadcastInput.parse(req.body)), { message: "Saved as a draft." }),
  );
  fastify.get("/broadcasts/:id", async (req, reply) => reply.ok(await service.getBroadcast(req.ctx, id(req))));
  fastify.post("/broadcasts/:id/start", async (req, reply) => reply.ok(await service.startBroadcast(req.ctx, id(req)), { message: "Sending." }));

  fastify.get("/messages", async (req, reply) => {
    const { messages, meta } = await service.listMessages(req.ctx, messageQuery.parse(req.query ?? {}));
    return reply.ok(messages, { meta });
  });
  fastify.post("/messages/retry", async (req, reply) => reply.ok(await service.retryFailed(req.ctx, retryInput.parse(req.body ?? {}))));
}
