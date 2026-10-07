"use strict";
import config from "../../config/index.js";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/app-error.js";
import { featureEnabled, getProvider } from "../../lib/integrations/registry.js";
import { mapAnswers } from "../../lib/integrations/field-mapping.js";
import { practiceFields } from "../../lib/leads/custom-values.js";
import { normalizeEmail, normalizePhone } from "../../lib/leads/normalize.js";
import { suggestMapping } from "../../lib/leads/import-parse.js";
import { createLead, missingRequired, resolveEntryStage, systemContext } from "../lead/service.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";
import { toCsv } from "../../lib/csv.js";

// Lead imports (Google add-on): upload/sheet -> draft (rows staged) ->
// mapping + dry-run -> background job creates leads row by row.
const SAMPLE_SIZE = 10;
const DRY_RUN_ROWS = 100;
const BATCH = 100;

async function assertEnabled(ctx, clinicId = null) {
  const provider = getProvider("sheet_import");
  if (!(await featureEnabled(ctx.practiceId, provider.feature, clinicId))) {
    throw forbidden("The Google leads add-on isn't enabled for this practice.");
  }
}

async function loadImport(ctx, id) {
  const row = await one(`SELECT * FROM lead_imports WHERE id = :id AND practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!row) throw notFound("Import not found.");
  return row;
}

async function counts(importIds) {
  if (!importIds.length) return new Map();
  const rows = await select(
    `SELECT import_id, status, count(*)::int AS n FROM lead_import_rows
      WHERE import_id IN (:importIds) GROUP BY import_id, status`,
    { importIds },
  );
  const out = new Map();
  for (const r of rows) {
    const c = out.get(r.import_id) ?? { pending: 0, created: 0, flagged: 0, merged: 0, skipped: 0, error: 0 };
    c[r.status] = r.n;
    out.set(r.import_id, c);
  }
  return out;
}

async function toClient(imp, { withSample = false } = {}) {
  const summary = (await counts([imp.id])).get(imp.id) ?? {};
  const out = { ...imp, summary };
  if (withSample) {
    out.sample = (
      await select(
        `SELECT data FROM lead_import_rows WHERE import_id = :id ORDER BY row_number LIMIT :limit`,
        { id: imp.id, limit: SAMPLE_SIZE },
      )
    ).map((r) => r.data);
    if (imp.status === "draft" && !Object.keys(imp.mapping ?? {}).length) {
      out.suggested_mapping = suggestMapping(imp.headers, await practiceFields(imp.practice_id));
    }
  }
  return out;
}

export async function createDraft(ctx, { sourceType, sourceName, headers, rows, clinicId = null }) {
  await assertEnabled(ctx, clinicId);
  if (!rows.length) throw badRequest("No rows to import (the first row must be the column headings).");
  const imp = await withTransaction(async (transaction) => {
    const created = await one(
      `INSERT INTO lead_imports (practice_id, clinic_id, source_type, source_name, headers, total_rows, created_by)
       VALUES (:practiceId, :clinicId, :sourceType, :sourceName, :headers::jsonb, :total, :userId) RETURNING *`,
      {
        practiceId: ctx.practiceId,
        clinicId,
        sourceType,
        sourceName: String(sourceName).slice(0, 255),
        headers: JSON.stringify(headers),
        total: rows.length,
        userId: ctx.userId ?? null,
      },
      { transaction },
    );
    // row_number = the line in the spreadsheet (line 1 holds the headings).
    await exec(
      `INSERT INTO lead_import_rows (import_id, practice_id, row_number, data)
       SELECT :importId, :practiceId, t.ord + 1, t.value
         FROM jsonb_array_elements(:rows::jsonb) WITH ORDINALITY AS t(value, ord)`,
      { importId: created.id, practiceId: ctx.practiceId, rows: JSON.stringify(rows) },
      { transaction },
    );
    return created;
  });
  return toClient(imp, { withSample: true });
}

export async function listImports(ctx, { page = 1, limit = 20 }) {
  const rows = await select(
    `SELECT i.*, u.fullname AS created_by_name, p.name AS pipeline_name, count(*) OVER()::int AS total
       FROM lead_imports i
       LEFT JOIN users u ON u.id = i.created_by
       LEFT JOIN pipelines p ON p.id = i.pipeline_id
      WHERE i.practice_id = :practiceId
      ORDER BY i.created_at DESC LIMIT :limit OFFSET :offset`,
    { practiceId: ctx.practiceId, limit, offset: (page - 1) * limit },
  );
  const byImport = await counts(rows.map((r) => r.id));
  return {
    imports: rows.map(({ total, headers, mapping, ...r }) => ({ ...r, summary: byImport.get(r.id) ?? {} })),
    meta: { page, limit, total: rows[0]?.total ?? 0 },
  };
}

export async function getImport(ctx, id) {
  return toClient(await loadImport(ctx, id), { withSample: true });
}

export async function listRows(ctx, id, { status, page = 1, limit = 50 }) {
  await loadImport(ctx, id);
  const rows = await select(
    `SELECT r.row_number, r.status, r.message, r.lead_id, r.data, count(*) OVER()::int AS total
       FROM lead_import_rows r
      WHERE r.import_id = :id AND (:status::text IS NULL OR r.status::text = :status)
      ORDER BY r.row_number LIMIT :limit OFFSET :offset`,
    { id, status: status ?? null, limit, offset: (page - 1) * limit },
  );
  return { rows: rows.map(({ total, ...r }) => r), meta: { page, limit, total: rows[0]?.total ?? 0 } };
}

// --- mapping + validation ---------------------------------------------------

function validateMapping(imp, mapping, fields) {
  const keys = new Set(fields.map((f) => f.key));
  for (const [header, target] of Object.entries(mapping)) {
    if (!imp.headers.includes(header)) throw badRequest(`Column "${header}" isn't in the file.`);
    if (target.startsWith("cf:") && !keys.has(target.slice(3))) throw badRequest(`Custom field "${target.slice(3)}" doesn't exist.`);
  }
  const targets = Object.values(mapping);
  if (!targets.includes("phone") && !targets.includes("email")) {
    throw badRequest("Map a column to Phone or Email so leads can be contacted and de-duplicated.");
  }
  for (const single of ["full_name", "first_name", "last_name", "phone", "email"]) {
    if (targets.filter((t) => t === single).length > 1) throw badRequest(`Only one column can be mapped to ${single}.`);
  }
}

// Saves the chosen settings on a draft and returns what processing needs.
async function prepare(ctx, imp, input) {
  if (imp.status !== "draft") throw conflict("This import has already been started.");
  const clinicId = input.clinic_id === undefined ? imp.clinic_id : input.clinic_id;
  await assertEnabled(ctx, clinicId);
  if (clinicId) {
    const clinic = await one(`SELECT 1 FROM clinics WHERE id = :clinicId AND practice_id = :practiceId`, {
      clinicId,
      practiceId: ctx.practiceId,
    });
    if (!clinic) throw badRequest("Clinic not found in this practice.");
  }
  const fields = await practiceFields(ctx.practiceId);
  validateMapping(imp, input.mapping, fields);
  const stage = await resolveEntryStage(ctx.practiceId, { pipelineId: input.pipeline_id, stageId: input.stage_id });
  const updated = await one(
    `UPDATE lead_imports SET mapping = :mapping::jsonb, pipeline_id = :pipelineId, stage_id = :stageId,
            clinic_id = :clinicId, dedupe_policy = :dedupe, assignment = :assignment, lead_source = :leadSource,
            updated_at = now()
      WHERE id = :id RETURNING *`,
    {
      id: imp.id,
      mapping: JSON.stringify(input.mapping),
      pipelineId: stage.pipeline_id,
      stageId: stage.id,
      clinicId: clinicId ?? null,
      dedupe: input.dedupe_policy,
      assignment: input.assignment,
      leadSource: input.lead_source || "Import",
    },
  );
  return { imp: updated, stage, fields };
}

// One spreadsheet row -> createLead() input, or an error message.
export function buildLead(data, mapping, fields) {
  const answers = {};
  const rowMapping = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (target === "ignore") continue;
    const value = data?.[header];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    answers[header] = target.startsWith("cf:") && isMulti(fields, target) ? splitList(value) : value;
    rowMapping[header] = target;
  }
  const { lead, warnings } = mapAnswers(answers, { mapping: rowMapping, fields });
  if (!lead.phone && !lead.email) return { error: "No phone number or email." };
  if (lead.phone && !normalizePhone(lead.phone)) warnings.push(`Phone "${lead.phone}" isn't a valid number; saved as typed.`);
  if (lead.email && !normalizeEmail(lead.email)) return { error: `Email "${lead.email}" isn't valid.` };
  if (!lead.full_name) lead.full_name = lead.email || lead.phone;
  return { lead, warnings };
}

const isMulti = (fields, target) => fields.find((f) => f.key === target.slice(3))?.field_type === "multi_select";
const splitList = (value) =>
  String(value)
    .split(/[,;|]/)
    .map((v) => v.trim())
    .filter(Boolean);

// Validates every row without writing leads: errors, duplicates against
// existing leads and within the file, and the outcome each row would get.
export async function dryRun(ctx, id, input) {
  const { imp, stage, fields } = await prepare(ctx, await loadImport(ctx, id), input);
  const rows = await select(`SELECT row_number, data FROM lead_import_rows WHERE import_id = :id ORDER BY row_number`, { id });

  const built = rows.map((r) => ({ row_number: r.row_number, ...buildLead(r.data, imp.mapping, fields) }));
  const phones = [...new Set(built.map((b) => normalizePhone(b.lead?.phone)).filter(Boolean))];
  const emails = [...new Set(built.map((b) => normalizeEmail(b.lead?.email)).filter(Boolean))];
  const existing = new Map();
  if (phones.length || emails.length) {
    const matches = await select(
      `SELECT phone_normalized, email_normalized, status FROM leads
        WHERE practice_id = :practiceId AND deleted_at IS NULL
          AND (phone_normalized IN (:phones) OR email_normalized IN (:emails))`,
      { practiceId: ctx.practiceId, phones: phones.length ? phones : [""], emails: emails.length ? emails : [""] },
    );
    for (const m of matches) {
      for (const key of [m.phone_normalized && `p:${m.phone_normalized}`, m.email_normalized && `e:${m.email_normalized}`]) {
        if (key && existing.get(key) !== "open") existing.set(key, m.status);
      }
    }
  }

  const summary = { total: rows.length, created: 0, flagged: 0, merged: 0, skipped: 0, error: 0, warnings: 0 };
  const results = [];
  for (const b of built) {
    let outcome;
    let message = b.error ?? null;
    if (b.error) outcome = "error";
    else {
      const keys = [normalizePhone(b.lead.phone) && `p:${normalizePhone(b.lead.phone)}`, normalizeEmail(b.lead.email) && `e:${normalizeEmail(b.lead.email)}`].filter(Boolean);
      const match = keys.map((k) => existing.get(k)).find(Boolean) ?? null;
      const missing = missingRequired(
        stage,
        { ...b.lead, owner_id: imp.assignment === "none" ? null : "auto" },
        b.lead.custom_fields,
      );
      if (missing.length) {
        outcome = "error";
        message = `Missing for "${stage.name}": ${missing.join(", ")}`;
      } else if (!match) outcome = "created";
      else if (imp.dedupe_policy === "skip") outcome = "skipped";
      else if (imp.dedupe_policy === "merge" && match === "open") outcome = "merged";
      else outcome = "flagged";
      if (outcome !== "error") {
        // Later rows with the same phone/email match this one.
        for (const k of keys) if (!existing.has(k)) existing.set(k, stage.stage_type === "open" ? "open" : stage.stage_type);
        if (b.warnings.length) {
          summary.warnings += 1;
          message = b.warnings.join("; ");
        }
      }
    }
    summary[outcome] += 1;
    if (results.length < DRY_RUN_ROWS || outcome === "error") {
      results.push({
        row_number: b.row_number,
        outcome,
        message,
        lead: b.lead ? { full_name: b.lead.full_name, phone: b.lead.phone ?? null, email: b.lead.email ?? null } : null,
      });
    }
  }
  return { summary, rows: results.slice(0, DRY_RUN_ROWS * 2) };
}

export async function startImport(ctx, id, input) {
  const { imp } = await prepare(ctx, await loadImport(ctx, id), input);
  const queued = await one(
    `UPDATE lead_imports SET status = 'queued', updated_at = now() WHERE id = :id AND status = 'draft' RETURNING *`,
    { id: imp.id },
  );
  if (!queued) throw conflict("This import has already been started.");
  await enqueue(QUEUES.LEADS_IMPORT, { importId: imp.id, practiceId: imp.practice_id }, { singletonKey: imp.id });
  return toClient(queued);
}

export async function cancelImport(ctx, id) {
  const imp = await loadImport(ctx, id);
  if (!["draft", "queued", "running", "failed"].includes(imp.status)) throw conflict("This import has already finished.");
  await exec(`UPDATE lead_imports SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = :id`, { id });
  return toClient(await loadImport(ctx, id));
}

// CSV of rows that failed (or were skipped), with the original columns.
export async function errorReport(ctx, id, { includeSkipped = false } = {}) {
  const imp = await loadImport(ctx, id);
  const rows = await select(
    `SELECT row_number, status, message, data FROM lead_import_rows
      WHERE import_id = :id AND status IN (:statuses) ORDER BY row_number`,
    { id, statuses: includeSkipped ? ["error", "skipped"] : ["error"] },
  );
  const header = ["Row", "Result", "Problem", ...imp.headers];
  const lines = [header, ...rows.map((r) => [r.row_number, r.status, r.message ?? "", ...imp.headers.map((h) => r.data?.[h] ?? "")])];
  return {
    filename: `import-${imp.created_at.toISOString().slice(0, 10)}-problems.csv`,
    csv: toCsv(lines),
  };
}

// --- background processing --------------------------------------------------

async function processRow(imp, ctx, fields, row) {
  const built = buildLead(row.data, imp.mapping, fields);
  if (built.error) {
    return exec(`UPDATE lead_import_rows SET status = 'error', message = :m WHERE id = :id`, { id: row.id, m: built.error });
  }
  try {
    await withTransaction(async (transaction) => {
      const result = await createLead(
        ctx,
        {
          ...built.lead,
          pipeline_id: imp.pipeline_id,
          stage_id: imp.stage_id,
          clinic_id: imp.clinic_id,
          source: imp.lead_source,
          sub_source: imp.source_name,
        },
        {
          dedupe: imp.dedupe_policy,
          assignment: imp.assignment === "none" ? "none" : "round_robin",
          transaction,
          via: {
            type: "import",
            activityType: "integration",
            body: `Imported from ${imp.source_name}`,
            metadata: { import_id: imp.id, row_number: row.row_number },
          },
        },
      );
      const status = result.merged ? "merged" : result.duplicate ? "skipped" : result.lead.duplicate_of_id ? "flagged" : "created";
      await exec(
        `UPDATE lead_import_rows SET status = :status, lead_id = :leadId, message = :message WHERE id = :id`,
        {
          id: row.id,
          status,
          leadId: result.lead.id,
          message: status === "skipped" ? "A lead with this phone or email already exists." : built.warnings.join("; ") || null,
        },
        { transaction },
      );
    });
  } catch (error) {
    await exec(`UPDATE lead_import_rows SET status = 'error', message = :m WHERE id = :id`, {
      id: row.id,
      m: String(error.message).slice(0, 500),
    });
  }
}

const progress = (id) =>
  exec(
    `UPDATE lead_imports SET processed_rows = (SELECT count(*) FROM lead_import_rows WHERE import_id = :id AND status <> 'pending'),
            updated_at = now() WHERE id = :id`,
    { id },
  );

// Resumable: only pending rows are processed, so a retried job continues.
export async function processImport({ importId }) {
  const imp = await one(`SELECT * FROM lead_imports WHERE id = :importId`, { importId });
  if (!imp || !["queued", "running", "failed"].includes(imp.status)) return;
  await exec(
    `UPDATE lead_imports SET status = 'running', error_message = NULL, started_at = coalesce(started_at, now()), updated_at = now()
      WHERE id = :importId`,
    { importId },
  );
  try {
    const fields = await practiceFields(imp.practice_id);
    const ctx = { ...systemContext(imp.practice_id), userId: imp.created_by };
    for (;;) {
      const { status } = await one(`SELECT status FROM lead_imports WHERE id = :importId`, { importId });
      if (status === "cancelled") return progress(importId);
      const batch = await select(
        `SELECT id, row_number, data FROM lead_import_rows
          WHERE import_id = :importId AND status = 'pending' ORDER BY row_number LIMIT :limit`,
        { importId, limit: BATCH },
      );
      if (!batch.length) break;
      for (const row of batch) await processRow(imp, ctx, fields, row);
      await progress(importId);
    }
    await progress(importId);
    await exec(
      `UPDATE lead_imports SET status = 'completed', finished_at = now(), updated_at = now()
        WHERE id = :importId AND status = 'running'`,
      { importId },
    );
  } catch (error) {
    await exec(`UPDATE lead_imports SET status = 'failed', error_message = :m, updated_at = now() WHERE id = :importId`, {
      importId,
      m: error.message,
    });
    throw error;
  }
}

// Raw rows are personal data: keep them only for the retention period.
export async function purgeImportRows() {
  await exec(
    `UPDATE lead_import_rows r SET data = NULL
       FROM lead_imports i
      WHERE i.id = r.import_id AND r.data IS NOT NULL
        AND i.created_at < now() - make_interval(days => :days)`,
    { days: config.integrations.payload_retention_days },
  );
}
