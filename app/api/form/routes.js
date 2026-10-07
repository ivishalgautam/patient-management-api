"use strict";
import { z } from "zod";
import * as service from "./service.js";
import { formCreate, formUpdate, slugParam, submissionInput } from "../../validation-schema/form.schema.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";

const id = (req) => uuidParam.parse(req.params).id;
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Authenticated: /v1/forms
export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => reply.ok(await service.listForms(req.ctx)));
  fastify.post("/", async (req, reply) =>
    reply.code(201).ok(await service.createForm(req.ctx, formCreate.parse(req.body)), { message: "Form created." }),
  );
  fastify.get("/:id", async (req, reply) => reply.ok(await service.getForm(req.ctx, id(req))));
  fastify.put("/:id", async (req, reply) =>
    reply.ok(await service.updateForm(req.ctx, id(req), formUpdate.parse(req.body)), { message: "Form saved." }),
  );
  fastify.delete("/:id", async (req, reply) => {
    await service.deleteForm(req.ctx, id(req));
    return reply.ok(null, { message: "Form deleted." });
  });
  fastify.get("/:id/submissions", async (req, reply) => {
    const { submissions, meta } = await service.listSubmissions(req.ctx, id(req), pageQuery.parse(req.query));
    return reply.ok(submissions, { meta });
  });
}

// Public (no auth): /v1/public/forms
export async function publicFormRoutes(fastify) {
  fastify.get("/:slug", async (req, reply) => reply.ok(await service.publicDefinition(slugParam.parse(req.params).slug)));
  fastify.post(
    "/:slug/submissions",
    {
      config: {
        // Per visitor and form, on top of the global limit.
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req) => `form:${req.params.slug}:${req.ip}`,
        },
      },
    },
    async (req, reply) =>
      reply.ok(
        await service.submit(slugParam.parse(req.params).slug, submissionInput.parse(req.body ?? {}), {
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        }),
      ),
  );
}
