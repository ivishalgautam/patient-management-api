"use strict";
import { z } from "zod";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";

const permissionKeys = z.array(z.string().max(64)).max(100);
const roleCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    permissions: permissionKeys.optional(),
    copy_from: z.string().uuid().optional(),
  })
  .refine((v) => v.permissions || v.copy_from, { message: "Give the role permissions or a role to copy." });
const roleUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  permissions: permissionKeys.optional(),
});
const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/roles
export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => reply.ok(await service.listRoles(req.ctx)));
  fastify.get("/permissions", async (req, reply) => reply.ok(service.permissionCatalogue()));
  fastify.get("/members", async (req, reply) => reply.ok(await service.listMembers(req.ctx)));
  fastify.get("/mine", async (req, reply) => reply.ok(await service.myAccess(req.ctx, req.user_data)));
  fastify.post("/", async (req, reply) =>
    reply.code(201).ok(await service.createRole(req.ctx, roleCreate.parse(req.body)), { message: "Role created." }),
  );
  fastify.put("/:id", async (req, reply) =>
    reply.ok(await service.updateRole(req.ctx, id(req), roleUpdate.parse(req.body)), { message: "Role saved." }),
  );
  fastify.delete("/:id", async (req, reply) => {
    await service.deleteRole(req.ctx, id(req));
    return reply.ok(null, { message: "Role deleted." });
  });
  fastify.put("/members/:id", async (req, reply) =>
    reply.ok(await service.assignRole(req.ctx, id(req), z.object({ role_id: z.string().uuid() }).parse(req.body).role_id), {
      message: "Role changed.",
    }),
  );
}
