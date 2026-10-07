"use strict";
import { z } from "zod";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";

const listQuery = z.object({
  unread: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Authenticated: /v1/notifications (always the caller's own)
export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => {
    const { notifications, meta } = await service.listNotifications(req.ctx, listQuery.parse(req.query ?? {}));
    return reply.ok(notifications, { meta });
  });
  fastify.get("/unread-count", async (req, reply) => reply.ok({ unread: await service.unreadCount(req.ctx) }));
  fastify.post("/read-all", async (req, reply) => {
    await service.markAllRead(req.ctx);
    return reply.ok(null);
  });
  fastify.post("/:id/read", async (req, reply) => {
    await service.markRead(req.ctx, uuidParam.parse(req.params).id);
    return reply.ok(null);
  });
}
