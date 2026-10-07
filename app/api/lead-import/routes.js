"use strict";
import { z } from "zod";
import * as service from "./service.js";
import { badRequest } from "../../lib/app-error.js";
import { fetchGoogleSheet, parseSpreadsheet } from "../../lib/leads/import-parse.js";
import { uuidParam } from "../../validation-schema/leads-config.schema.js";
import { importRowsQuery, importSettings, importsQuery, sheetImport } from "../../validation-schema/lead-import.schema.js";

const id = (req) => uuidParam.parse(req.params).id;

// Authenticated: /v1/lead-imports (Google leads add-on)
export default async function routes(fastify) {
  fastify.get("/", async (req, reply) => {
    const { imports, meta } = await service.listImports(req.ctx, importsQuery.parse(req.query));
    return reply.ok(imports, { meta });
  });

  // multipart: file (CSV/XLSX), optional clinic_id
  fastify.post("/upload", async (req, reply) => {
    let file = null;
    const fields = {};
    for await (const part of req.parts()) {
      if (part.file) file = { name: part.filename, buffer: await part.toBuffer() };
      else fields[part.fieldname] = part.value;
    }
    if (!file) throw badRequest("Choose a CSV or Excel file to upload.");
    const csv = /\.(csv|txt)$/i.test(file.name ?? "");
    const { headers, rows } = parseSpreadsheet(file.buffer, { csv });
    const clinicId = fields.clinic_id ? z.string().uuid().parse(fields.clinic_id) : null;
    const draft = await service.createDraft(req.ctx, { sourceType: "file", sourceName: file.name || "upload", headers, rows, clinicId });
    return reply.code(201).ok(draft);
  });

  fastify.post("/sheet", async (req, reply) => {
    const input = sheetImport.parse(req.body);
    const { headers, rows, sourceName } = await fetchGoogleSheet(input.url);
    const draft = await service.createDraft(req.ctx, {
      sourceType: "google_sheet",
      sourceName,
      headers,
      rows,
      clinicId: input.clinic_id ?? null,
    });
    return reply.code(201).ok(draft);
  });

  fastify.get("/:id", async (req, reply) => reply.ok(await service.getImport(req.ctx, id(req))));
  fastify.get("/:id/rows", async (req, reply) => {
    const { rows, meta } = await service.listRows(req.ctx, id(req), importRowsQuery.parse(req.query));
    return reply.ok(rows, { meta });
  });
  fastify.post("/:id/dry-run", async (req, reply) =>
    reply.ok(await service.dryRun(req.ctx, id(req), importSettings.parse(req.body))),
  );
  fastify.post("/:id/start", async (req, reply) =>
    reply.ok(await service.startImport(req.ctx, id(req), importSettings.parse(req.body)), { message: "Import started." }),
  );
  fastify.post("/:id/cancel", async (req, reply) =>
    reply.ok(await service.cancelImport(req.ctx, id(req)), { message: "Import cancelled." }),
  );
  fastify.get("/:id/errors.csv", async (req, reply) => {
    const { filename, csv } = await service.errorReport(req.ctx, id(req), {
      includeSkipped: req.query?.include_skipped === "true",
    });
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });
}
