"use strict";
import { z } from "zod";
import * as service from "./service.js";
import {
  eventsQuery,
  facebookFinalize,
  integrationUpdate,
  webhookIntegrationCreate,
} from "../../validation-schema/integration.schema.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";

const id = (req) => uuidParam.parse(req.params).id;
const session = (req) => z.string().uuid().parse(req.query.session);

// Authenticated: /v1/integrations
export default async function routes(fastify) {
  fastify.get("/providers", async (req, reply) => reply.ok(await service.listProviders(req.ctx)));
  fastify.get("/", async (req, reply) => reply.ok(await service.listIntegrations(req.ctx)));
  fastify.post("/", async (req, reply) =>
    reply
      .code(201)
      .ok(await service.createWebhookIntegration(req.ctx, webhookIntegrationCreate.parse(req.body)), {
        message: "Integration created.",
      }),
  );

  // Facebook connect flow (the OAuth callback itself is public)
  fastify.get("/facebook/oauth/start", async (req, reply) => reply.ok(service.startFacebookOAuth(req.ctx)));
  fastify.get("/facebook/oauth/pages", async (req, reply) => reply.ok(await service.sessionPages(req.ctx, session(req))));
  fastify.get("/facebook/oauth/forms", async (req, reply) =>
    reply.ok(await service.sessionForms(req.ctx, session(req), z.string().min(1).parse(req.query.page_id))),
  );
  fastify.post("/facebook/oauth/finalize", async (req, reply) =>
    reply.ok(await service.finalizeFacebook(req.ctx, facebookFinalize.parse(req.body)), { message: "Facebook connected." }),
  );

  fastify.get("/:id", async (req, reply) => reply.ok(await service.getIntegration(req.ctx, id(req))));
  fastify.put("/:id", async (req, reply) =>
    reply.ok(await service.updateIntegration(req.ctx, id(req), integrationUpdate.parse(req.body)), {
      message: "Integration saved.",
    }),
  );
  fastify.delete("/:id", async (req, reply) => {
    await service.disconnect(req.ctx, id(req));
    return reply.ok(null, { message: "Integration disconnected." });
  });
  fastify.post("/:id/rotate-token", async (req, reply) =>
    reply.ok(await service.rotateToken(req.ctx, id(req)), { message: "Webhook URL changed." }),
  );
  fastify.post("/:id/sync", async (req, reply) => {
    await service.syncNow(req.ctx, id(req));
    return reply.ok(null, { message: "Sync started." });
  });
  fastify.post("/:id/check", async (req, reply) => reply.ok(await service.checkNow(req.ctx, id(req))));
  fastify.get("/:id/events", async (req, reply) => {
    const { events, meta } = await service.listEvents(req.ctx, id(req), eventsQuery.parse(req.query));
    return reply.ok(events, { meta });
  });
  fastify.post("/:id/events/:eventId/retry", async (req, reply) => {
    await service.retryEvent(req.ctx, id(req), z.string().uuid().parse(req.params.eventId));
    return reply.ok(null, { message: "Queued for retry." });
  });
}

// Public: the browser comes back here from Facebook's consent screen.
export async function integrationPublicRoutes(fastify) {
  fastify.get("/facebook/oauth/callback", async (req, reply) =>
    reply.redirect(await service.handleFacebookCallback(req.query ?? {})),
  );
}
