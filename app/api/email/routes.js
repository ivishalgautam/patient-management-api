"use strict";
import * as service from "./service.js";
import { settingsInput, testInput } from "../../validation-schema/email.schema.js";

// Authenticated: /v1/email
export default async function routes(fastify) {
  fastify.get("/settings", async (req, reply) => reply.ok(await service.getSettings(req.ctx)));
  fastify.put("/settings", async (req, reply) =>
    reply.ok(await service.saveSettings(req.ctx, settingsInput.parse(req.body)), { message: "Email account connected." }),
  );
  fastify.delete("/settings", async (req, reply) => {
    await service.removeSettings(req.ctx);
    return reply.ok(null, { message: "Email account removed." });
  });
  fastify.post("/test", async (req, reply) => {
    const result = await service.sendTest(req.ctx, testInput.parse(req.body));
    return reply.ok(result, { message: `Test email sent to ${result.sent_to}.` });
  });
}
