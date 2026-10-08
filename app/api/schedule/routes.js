"use strict";
import * as service from "./service.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import { assignInput, chairInput, chairQuery, chairUpdate, dayQuery, seatInput, waitingQuery } from "../../validation-schema/schedule.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/schedule (chair board)
export default async function routes(fastify) {
  fastify.get("/chairs", async (req, reply) => reply.ok(await service.listChairs(req.ctx, chairQuery.parse(req.query ?? {}))));
  fastify.post("/chairs", async (req, reply) =>
    reply.code(201).ok(await service.createChair(req.ctx, chairInput.parse(req.body)), { message: "Chair added." }),
  );
  fastify.put("/chairs/:id", async (req, reply) =>
    reply.ok(await service.updateChair(req.ctx, id(req), chairUpdate.parse(req.body)), { message: "Chair saved." }),
  );

  fastify.get("/day", async (req, reply) => reply.ok(await service.dayBoard(req.ctx, dayQuery.parse(req.query ?? {}))));
  fastify.put("/bookings/:id/chair", async (req, reply) => reply.ok(await service.assignChair(req.ctx, id(req), assignInput.parse(req.body))));
  fastify.post("/bookings/:id/check-in", async (req, reply) => reply.ok(await service.checkIn(req.ctx, id(req)), { message: "Checked in." }));
  fastify.post("/bookings/:id/seat", async (req, reply) =>
    reply.ok(await service.seat(req.ctx, id(req), seatInput.parse(req.body ?? {})), { message: "Seated." }),
  );
  fastify.post("/bookings/:id/finish", async (req, reply) => reply.ok(await service.finish(req.ctx, id(req)), { message: "Visit finished." }));
  fastify.post("/bookings/:id/undo", async (req, reply) => reply.ok(await service.undo(req.ctx, id(req)), { message: "Undone." }));

  fastify.get("/waiting-report", async (req, reply) => reply.ok(await service.waitingReport(req.ctx, waitingQuery.parse(req.query ?? {}))));
}
