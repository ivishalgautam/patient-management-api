"use strict";
import * as service from "./service.js";
import { tagCreate, uuidParam } from "../../validation-schema/leads-config.schema.js";

export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => reply.ok(await service.listTags(req.ctx)));
  fastify.post("/", async (req, reply) =>
    reply.code(201).ok(await service.createTag(req.ctx, tagCreate.parse(req.body)), { message: "Tag created." }),
  );
  fastify.delete("/:id", async (req, reply) => {
    await service.deleteTag(req.ctx, uuidParam.parse(req.params).id);
    return reply.ok(null, { message: "Tag deleted." });
  });
}
