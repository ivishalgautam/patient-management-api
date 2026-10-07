"use strict";
import { z } from "zod";
import * as service from "./service.js";

const featureUpdate = z.object({
  enabled: z.boolean().default(false),
  clinic_id: z.string().uuid().nullable().optional(),
  reset: z.boolean().optional(),
});

// Authenticated: /v1/practice-features
export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => reply.ok(await service.listFeatures(req.ctx)));
  fastify.put("/:key", async (req, reply) =>
    reply.ok(await service.setFeature(req.ctx, z.string().max(64).parse(req.params.key), featureUpdate.parse(req.body ?? {})), {
      message: "Add-on updated.",
    }),
  );
}
