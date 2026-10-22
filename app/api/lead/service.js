"use strict";
import config from "../../config/index.js";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/app-error.js";
import { toCsv } from "../../lib/csv.js";
import { can } from "../../lib/permissions.js";
import { ensureLeadDefaults } from "../../lib/leads/defaults.js";
import { normalizeEmail, normalizePhone } from "../../lib/leads/normalize.js";
import { nextRoundRobinOwner } from "../../lib/leads/assignment.js";
import {
  customFilter,
  practiceFields,
  readCustomValues,
  writeCustomValues,
} from "../../lib/leads/custom-values.js";
import { resolveTagIds } from "../tag/service.js";
import { emitLeadEvent } from "../../lib/email/events.js";

// ---------------------------------------------------------------------------
// Context helpers. Integrations and public forms call in with a system
// context: systemContext(practiceId).
export const systemContext = (practiceId) => ({ practiceId, userId: null, system: true });
const seesAll = (ctx) => ctx.system || can(ctx, "leads.view_all");
const seesAllClinics = (ctx) => ctx.system || can(ctx, "leads.view_all_clinics");

// Clinics the caller works at: staff clinic mappings plus clinics they run
// as the doctor. Cached on the request context.
async function viewerClinicIds(ctx) {
  if (!ctx.clinicIds) {
    const rows = await select(
      `SELECT m.clinic_id AS id FROM clinic_staff_mappings m JOIN staffs s ON s.id = m.staff_id WHERE s.user_id = :userId
       UNION
       SELECT c.id FROM clinics c JOIN doctors d ON d.id = c.doctor_id WHERE d.user_id = :userId`,
      { userId: ctx.userId },
    );
    ctx.clinicIds = rows.map((r) => r.id);
  }
  return ctx.clinicIds;
}

// Which leads (alias l) the caller sees: their own unless leads.view_all;
// practice-wide leads, their clinics' leads and their own leads unless
// leads.view_all_clinics. Returns { conditions, sql: "AND ..." | "", params }.
async function visibility(ctx) {
  const conditions = [];
  const params = { viewerId: ctx.userId ?? null, viewerClinicIds: [] };
  if (!seesAll(ctx)) conditions.push(`l.owner_id = :viewerId`);
  if (!seesAllClinics(ctx)) {
    params.viewerClinicIds = await viewerClinicIds(ctx);
    conditions.push(
      params.viewerClinicIds.length
        ? `(l.clinic_id IS NULL OR l.clinic_id IN (:viewerClinicIds) OR l.owner_id = :viewerId)`
        : `(l.clinic_id IS NULL OR l.owner_id = :viewerId)`,
    );
  }
  return { conditions, sql: conditions.map((c) => `AND ${c}`).join(" "), params };
}

const STAGE_STATUS = { open: "open", won: "won", lost: "lost" };

export async function loadLead(ctx, id, { transaction, forUpdate = false } = {}) {
  const scope = await visibility(ctx);
  const lead = await one(
    `SELECT l.* FROM leads l
      WHERE l.id = :id AND l.practice_id = :practiceId AND l.deleted_at IS NULL ${scope.sql}
      ${forUpdate ? "FOR UPDATE" : ""}`,
    { id, practiceId: ctx.practiceId, ...scope.params },
    { transaction },
  );
  if (!lead) throw notFound("Lead not found.");
  return lead;
}

async function stageById(practiceId, stageId, transaction) {
  return one(
    `SELECT s.*, p.archived_at AS pipeline_archived_at FROM pipeline_stages s
       JOIN pipelines p ON p.id = s.pipeline_id
      WHERE s.id = :stageId AND s.practice_id = :practiceId AND s.archived_at IS NULL`,
    { stageId, practiceId },
    { transaction },
  );
}

// Pipeline + entry stage for a new lead: the given stage, else the first
// stage of the given pipeline, else the first stage of the default pipeline.
export async function resolveEntryStage(practiceId, { pipelineId, stageId } = {}, { transaction } = {}) {
  if (stageId) {
    const stage = await stageById(practiceId, stageId, transaction);
    if (!stage || (pipelineId && stage.pipeline_id !== pipelineId)) throw badRequest("Stage not found in this pipeline.");
    if (stage.pipeline_archived_at) throw badRequest("The pipeline is archived.");
    return stage;
  }
  let pid = pipelineId;
  if (!pid) {
    await ensureLeadDefaults(practiceId, { transaction });
    const def = await one(
      `SELECT id FROM pipelines WHERE practice_id = :practiceId AND is_default AND archived_at IS NULL`,
      { practiceId },
      { transaction },
    );
    if (!def) throw badRequest("No default pipeline configured.");
    pid = def.id;
  }
  const stage = await one(
    `SELECT s.*, p.archived_at AS pipeline_archived_at FROM pipeline_stages s
       JOIN pipelines p ON p.id = s.pipeline_id
      WHERE s.pipeline_id = :pid AND s.practice_id = :practiceId AND s.archived_at IS NULL
      ORDER BY (s.stage_type = 'open') DESC, s.position LIMIT 1`,
    { pid, practiceId },
    { transaction },
  );
  if (!stage) throw badRequest("Pipeline not found.");
  if (stage.pipeline_archived_at) throw badRequest("The pipeline is archived.");
  return stage;
}

// Fields a stage requires that the lead doesn't have.
export function missingRequired(stage, lead, customValues = {}) {
  const has = (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);
  return (stage.required_fields ?? []).filter((key) =>
    key.startsWith("cf:") ? !has(customValues[key.slice(3)]) : !has(lead[key]),
  );
}

async function assertOwner(ctx, ownerId, transaction) {
  if (!ownerId) return;
  if (!ctx.system && ownerId !== ctx.userId && !can(ctx, "leads.assign")) {
    throw forbidden("You can't assign leads to other people.");
  }
  const user = await one(
    `SELECT 1 FROM users WHERE id = :ownerId AND practice_id = :practiceId
        AND role IN ('doctor', 'staff') AND is_active AND deleted_at IS NULL`,
    { ownerId, practiceId: ctx.practiceId },
    { transaction },
  );
  if (!user) throw badRequest("Owner must be an active team member of this practice.");
}

async function assertClinic(ctx, clinicId, transaction) {
  if (!clinicId) return;
  const ok = await one(
    `SELECT 1 FROM clinics WHERE id = :clinicId AND practice_id = :practiceId`,
    { clinicId, practiceId: ctx.practiceId },
    { transaction },
  );
  if (!ok) throw badRequest("Clinic not found in this practice.");
  if (!seesAllClinics(ctx) && !(await viewerClinicIds(ctx)).includes(clinicId)) {
    throw forbidden("You can only use clinics you work at.");
  }
}

// scope: a visibility() result, to list only leads the caller may see.
export async function findDuplicates(practiceId, { phone, email }, { excludeId, transaction, scope } = {}) {
  const phoneNormalized = normalizePhone(phone);
  const emailNormalized = normalizeEmail(email);
  if (!phoneNormalized && !emailNormalized) return [];
  return select(
    `SELECT l.id, l.full_name, l.phone, l.email, l.status, l.stage_id, l.owner_id, l.created_at,
            CASE WHEN l.phone_normalized = :phoneNormalized THEN 'phone' ELSE 'email' END AS matched_on
       FROM leads l
      WHERE l.practice_id = :practiceId AND l.deleted_at IS NULL
        AND (${excludeId ? "l.id <> :excludeId AND" : ""}
             (l.phone_normalized = :phoneNormalized OR l.email_normalized = :emailNormalized))
        ${scope?.sql ?? ""}
      ORDER BY (l.status = 'open') DESC, l.created_at DESC LIMIT 10`,
    { practiceId, phoneNormalized, emailNormalized, excludeId: excludeId ?? null, ...(scope?.params ?? {}) },
    { transaction },
  );
}

// Duplicates the caller is allowed to see (GET /leads/duplicates, 409s).
export async function findVisibleDuplicates(ctx, input, options = {}) {
  return findDuplicates(ctx.practiceId, input, { ...options, scope: await visibility(ctx) });
}

export async function addActivity(practiceId, leadId, activity, { transaction } = {}) {
  const row = await one(
    // clock_timestamp(): entries written in one transaction keep their order
    // (now() is the same for the whole transaction).
    `INSERT INTO lead_activities (practice_id, lead_id, type, body, metadata, due_at, created_by, created_at, updated_at)
     VALUES (:practiceId, :leadId, :type, :body, :metadata::jsonb, :dueAt, :createdBy, clock_timestamp(), clock_timestamp())
     RETURNING *`,
    {
      practiceId,
      leadId,
      type: activity.type,
      body: activity.body ?? null,
      metadata: JSON.stringify(activity.metadata ?? {}),
      dueAt: activity.due_at ?? null,
      createdBy: activity.created_by ?? null,
    },
    { transaction },
  );
  await exec(`UPDATE leads SET last_activity_at = now() WHERE id = :leadId`, { leadId }, { transaction });
  return row;
}

async function recomputeFollowUp(leadId, transaction) {
  await exec(
    `UPDATE leads SET next_follow_up_at = (
       SELECT min(due_at) FROM lead_activities
        WHERE lead_id = :leadId AND type = 'follow_up' AND completed_at IS NULL
     ) WHERE id = :leadId`,
    { leadId },
    { transaction },
  );
}

async function recordStageChange(practiceId, lead, toStage, userId, transaction) {
  const previous = await one(
    `SELECT changed_at FROM lead_stage_history WHERE lead_id = :leadId ORDER BY changed_at DESC LIMIT 1`,
    { leadId: lead.id },
    { transaction },
  );
  const since = previous?.changed_at ?? lead.created_at;
  await exec(
    `INSERT INTO lead_stage_history (practice_id, lead_id, from_stage_id, to_stage_id, changed_by, seconds_in_previous_stage, changed_at)
     VALUES (:practiceId, :leadId, :from, :to, :userId,
             CASE WHEN :since::timestamptz IS NULL THEN NULL ELSE extract(epoch FROM clock_timestamp() - :since::timestamptz)::int END,
             clock_timestamp())`,
    { practiceId, leadId: lead.id, from: lead.stage_id, to: toStage.id, userId: userId ?? null, since: since ?? null },
    { transaction },
  );
}

// ---------------------------------------------------------------------------
// Create. options.dedupe: "reject" (409 with matches unless input.force),
// "create_flagged" (create, mark duplicate_of_id), "merge" (attach to the
// existing open lead), "skip" (return the existing lead untouched).
// options.assignment: "auto" (explicit owner, else round-robin, else the
// creator), "round_robin", "none", or { fixed: userId }.
export async function createLead(ctx, input, options = {}) {
  const { dedupe = "reject", assignment = "auto", via = { type: "manual" }, formId, integrationId, transaction: outer } = options;
  const run = async (transaction) => {
    const stage = await resolveEntryStage(ctx.practiceId, { pipelineId: input.pipeline_id, stageId: input.stage_id }, { transaction });
    await assertClinic(ctx, input.clinic_id, transaction);

    const duplicates = await findDuplicates(ctx.practiceId, input, { transaction });
    let duplicateOf = null;
    if (duplicates.length) {
      const existing = duplicates[0];
      if (dedupe === "reject" && !input.force) {
        throw new AppError(409, "A lead with this phone or email already exists.", {
          code: "DUPLICATE_LEAD",
          details: { duplicates: ctx.system ? duplicates : await findVisibleDuplicates(ctx, input, { transaction }) },
        });
      }
      if (dedupe === "skip") return { lead: existing, created: false, duplicate: true };
      if (dedupe === "merge" && existing.status === "open") {
        await mergeInto(ctx, existing.id, input, via, transaction);
        return { lead: await one(`SELECT * FROM leads WHERE id = :id`, { id: existing.id }, { transaction }), created: false, merged: true };
      }
      duplicateOf = existing.id;
    }

    let ownerId = null;
    // (typeof check: "auto".fixed is the legacy String.prototype.fixed method)
    if (typeof assignment === "object" && assignment?.fixed) ownerId = assignment.fixed;
    else if (assignment === "auto" && input.owner_id) {
      await assertOwner(ctx, input.owner_id, transaction);
      ownerId = input.owner_id;
    }
    if (!ownerId && (assignment === "auto" || assignment === "round_robin")) {
      ownerId = await nextRoundRobinOwner(stage.pipeline_id, { transaction });
    }
    if (!ownerId && assignment === "auto" && !ctx.system && ["doctor", "staff"].includes(ctx.role)) {
      ownerId = ctx.userId;
    }

    const fields = await practiceFields(ctx.practiceId, { transaction });
    const customValues = input.custom_fields ?? {};
    const candidate = { ...input, owner_id: ownerId };
    const missing = missingRequired(stage, candidate, customValues);
    if (missing.length) {
      throw badRequest(`Fill in before entering "${stage.name}": ${missing.join(", ")}`, {
        code: "REQUIRED_FIELDS",
        details: { missing },
      });
    }

    const lead = await one(
      `INSERT INTO leads (practice_id, clinic_id, pipeline_id, stage_id, owner_id, full_name, phone, phone_normalized,
                          email, email_normalized, source, sub_source, status, notes, form_id, integration_id,
                          duplicate_of_id, created_by, created_at, updated_at)
       VALUES (:practiceId, :clinicId, :pipelineId, :stageId, :ownerId, :fullName, :phone, :phoneNormalized,
               :email, :emailNormalized, :source, :subSource, :status, :notes, :formId, :integrationId,
               :duplicateOf, :createdBy, coalesce(:createdAt::timestamptz, now()), now())
       RETURNING *`,
      {
        practiceId: ctx.practiceId,
        clinicId: input.clinic_id ?? null,
        pipelineId: stage.pipeline_id,
        stageId: stage.id,
        ownerId,
        fullName: input.full_name,
        phone: input.phone || null,
        phoneNormalized: normalizePhone(input.phone),
        email: input.email || null,
        emailNormalized: normalizeEmail(input.email),
        source: input.source ?? "Walk-in",
        subSource: input.sub_source ?? null,
        status: STAGE_STATUS[stage.stage_type],
        notes: input.notes ?? null,
        formId: formId ?? null,
        integrationId: integrationId ?? null,
        duplicateOf,
        createdBy: ctx.userId ?? null,
        createdAt: input.submitted_at ?? null,
      },
      { transaction },
    );

    await writeCustomValues(ctx.practiceId, lead.id, customValues, { transaction, fields });
    if (input.tags?.length) {
      const tagIds = await resolveTagIds(ctx.practiceId, input.tags, { transaction, userId: ctx.userId });
      for (const tagId of tagIds) {
        await exec(`INSERT INTO lead_tags (lead_id, tag_id) VALUES (:leadId, :tagId) ON CONFLICT DO NOTHING`, { leadId: lead.id, tagId }, { transaction });
      }
    }
    await exec(
      `INSERT INTO lead_stage_history (practice_id, lead_id, from_stage_id, to_stage_id, changed_by, changed_at)
       VALUES (:practiceId, :leadId, NULL, :stageId, :userId, clock_timestamp())`,
      { practiceId: ctx.practiceId, leadId: lead.id, stageId: stage.id, userId: ctx.userId ?? null },
      { transaction },
    );
    await addActivity(
      ctx.practiceId,
      lead.id,
      {
        type: via.activityType ?? "created",
        body: via.body ?? null,
        metadata: { via: via.type, ...(via.metadata ?? {}), ...(duplicateOf ? { duplicate_of: duplicateOf } : {}) },
        created_by: ctx.userId,
      },
      { transaction },
    );
    if (input.next_follow_up_at) {
      await addActivity(
        ctx.practiceId,
        lead.id,
        { type: "follow_up", body: "Follow up", due_at: input.next_follow_up_at, created_by: ctx.userId },
        { transaction },
      );
      await recomputeFollowUp(lead.id, transaction);
    }
    emitLeadEvent(transaction, { type: "lead_created", practiceId: ctx.practiceId, leadId: lead.id });
    return { lead, created: true, duplicateOf };
  };
  return outer ? run(outer) : withTransaction(run);
}

// Adds a repeat enquiry to an existing open lead: fills blank contact
// fields and empty custom values, adds tags, and logs it on the timeline.
async function mergeInto(ctx, leadId, input, via, transaction) {
  const lead = await one(`SELECT * FROM leads WHERE id = :leadId FOR UPDATE`, { leadId }, { transaction });
  await exec(
    `UPDATE leads SET
        phone = coalesce(phone, :phone), phone_normalized = coalesce(phone_normalized, :phoneNormalized),
        email = coalesce(email, :email), email_normalized = coalesce(email_normalized, :emailNormalized),
        updated_at = now()
      WHERE id = :leadId`,
    {
      leadId,
      phone: input.phone || null,
      phoneNormalized: normalizePhone(input.phone),
      email: input.email || null,
      emailNormalized: normalizeEmail(input.email),
    },
    { transaction },
  );
  const existing = (await readCustomValues(ctx.practiceId, [leadId], { transaction }))[leadId];
  const fill = Object.fromEntries(
    Object.entries(input.custom_fields ?? {}).filter(([k]) => existing[k] === undefined || existing[k] === null),
  );
  await writeCustomValues(ctx.practiceId, leadId, fill, { transaction });
  if (input.tags?.length) {
    for (const tagId of await resolveTagIds(ctx.practiceId, input.tags, { transaction })) {
      await exec(`INSERT INTO lead_tags (lead_id, tag_id) VALUES (:leadId, :tagId) ON CONFLICT DO NOTHING`, { leadId, tagId }, { transaction });
    }
  }
  await addActivity(
    ctx.practiceId,
    leadId,
    {
      type: via.activityType ?? "updated",
      body: via.body ?? `Repeat enquiry via ${via.type}`,
      metadata: { via: via.type, merged: true, ...(via.metadata ?? {}) },
      created_by: ctx.userId,
    },
    { transaction },
  );
  return lead;
}

// ---------------------------------------------------------------------------
const EDITABLE = ["full_name", "phone", "email", "clinic_id", "source", "sub_source", "notes", "lost_reason"];

export async function updateLead(ctx, id, input) {
  return withTransaction(async (transaction) => {
    const lead = await loadLead(ctx, id, { transaction, forUpdate: true });
    await assertClinic(ctx, input.clinic_id, transaction);
    const changed = EDITABLE.filter((k) => k in input && (input[k] ?? null) !== (lead[k] ?? null));
    if ("phone" in input || "email" in input) {
      const dups = await findDuplicates(
        ctx.practiceId,
        { phone: input.phone ?? lead.phone, email: input.email ?? lead.email },
        { excludeId: id, transaction },
      );
      if (dups.length && (changed.includes("phone") || changed.includes("email"))) {
        throw new AppError(409, "Another lead already uses this phone or email.", {
          code: "DUPLICATE_LEAD",
          details: {
            duplicates: await findVisibleDuplicates(
              ctx,
              { phone: input.phone ?? lead.phone, email: input.email ?? lead.email },
              { excludeId: id, transaction },
            ),
          },
        });
      }
    }
    const next = { ...lead, ...Object.fromEntries(changed.map((k) => [k, input[k] ?? null])) };
    await exec(
      `UPDATE leads SET full_name = :full_name, phone = :phone, phone_normalized = :phoneNormalized,
              email = :email, email_normalized = :emailNormalized, clinic_id = :clinic_id, source = :source,
              sub_source = :sub_source, notes = :notes, lost_reason = :lost_reason,
              updated_by = :userId, updated_at = now()
        WHERE id = :id`,
      {
        ...next,
        email: next.email || null,
        phone: next.phone || null,
        phoneNormalized: normalizePhone(next.phone),
        emailNormalized: normalizeEmail(next.email),
        userId: ctx.userId,
        id,
      },
      { transaction },
    );
    if (input.custom_fields) {
      await writeCustomValues(ctx.practiceId, id, input.custom_fields, { transaction });
      changed.push(...Object.keys(input.custom_fields).map((k) => `cf:${k}`));
    }
    if (input.tags) {
      const tagIds = await resolveTagIds(ctx.practiceId, input.tags, { transaction, userId: ctx.userId });
      await exec(`DELETE FROM lead_tags WHERE lead_id = :id`, { id }, { transaction });
      for (const tagId of tagIds) {
        await exec(`INSERT INTO lead_tags (lead_id, tag_id) VALUES (:id, :tagId)`, { id, tagId }, { transaction });
      }
      changed.push("tags");
    }
    if (changed.length) {
      // Field names only: values stay out of the activity log.
      await addActivity(ctx.practiceId, id, { type: "updated", metadata: { fields: changed }, created_by: ctx.userId }, { transaction });
    }
  });
}

export async function moveLead(ctx, id, { stage_id: stageId, lost_reason: lostReason }, { transaction: outer } = {}) {
  const run = async (transaction) => {
    const lead = await loadLead(ctx, id, { transaction, forUpdate: true });
    if (lead.stage_id === stageId) return lead;
    const stage = await stageById(ctx.practiceId, stageId, transaction);
    if (!stage || stage.pipeline_id !== lead.pipeline_id) throw badRequest("Stage is not part of this lead's pipeline.");
    const customValues = (await readCustomValues(ctx.practiceId, [id], { transaction }))[id];
    const missing = missingRequired(stage, lead, customValues);
    if (missing.length) {
      throw badRequest(`Fill in before moving to "${stage.name}": ${missing.join(", ")}`, {
        code: "REQUIRED_FIELDS",
        details: { missing },
      });
    }
    const from = await one(`SELECT name FROM pipeline_stages WHERE id = :id`, { id: lead.stage_id }, { transaction });
    await recordStageChange(ctx.practiceId, lead, stage, ctx.userId, transaction);
    await exec(
      `UPDATE leads SET stage_id = :stageId,
              status = CASE WHEN status = 'converted' THEN status ELSE :status::enum_leads_status END,
              lost_reason = CASE WHEN :stageType = 'lost' THEN coalesce(:lostReason, lost_reason) ELSE lost_reason END,
              updated_by = :userId, updated_at = now()
        WHERE id = :id`,
      { id, stageId, status: STAGE_STATUS[stage.stage_type], stageType: stage.stage_type, lostReason: lostReason ?? null, userId: ctx.userId },
      { transaction },
    );
    await addActivity(
      ctx.practiceId,
      id,
      {
        type: "stage_change",
        body: `${from?.name ?? "?"} → ${stage.name}`,
        metadata: { from_stage_id: lead.stage_id, to_stage_id: stage.id, ...(lostReason ? { lost_reason: lostReason } : {}) },
        created_by: ctx.userId,
      },
      { transaction },
    );
    emitLeadEvent(transaction, { type: "stage_reached", practiceId: ctx.practiceId, leadId: id, stageId });
    return { ...lead, stage_id: stageId };
  };
  return outer ? run(outer) : withTransaction(run);
}

export async function assignLead(ctx, id, ownerId, { transaction: outer } = {}) {
  const run = async (transaction) => {
    const lead = await loadLead(ctx, id, { transaction, forUpdate: true });
    if (!ctx.system && !can(ctx, "leads.assign") && ownerId !== ctx.userId) {
      throw forbidden("You can't assign leads to other people.");
    }
    await assertOwner(ctx, ownerId, transaction);
    if (lead.owner_id === ownerId) return;
    await exec(`UPDATE leads SET owner_id = :ownerId, updated_by = :userId, updated_at = now() WHERE id = :id`, { id, ownerId, userId: ctx.userId }, { transaction });
    await addActivity(
      ctx.practiceId,
      id,
      { type: "assignment", metadata: { from_owner_id: lead.owner_id, to_owner_id: ownerId }, created_by: ctx.userId },
      { transaction },
    );
  };
  return outer ? run(outer) : withTransaction(run);
}

export async function deleteLead(ctx, id) {
  const lead = await loadLead(ctx, id);
  await exec(`UPDATE leads SET deleted_at = now(), updated_by = :userId WHERE id = :id`, { id: lead.id, userId: ctx.userId });
}

const BULK_PERMISSION = { assign: "leads.assign", move: "leads.edit", tag: "leads.edit", untag: "leads.edit", delete: "leads.delete" };

// Applies the action lead by lead; one failure doesn't stop the rest.
export async function bulk(ctx, input) {
  if (!can(ctx, BULK_PERMISSION[input.action])) throw forbidden("You don't have permission for this bulk action.");
  const results = { done: [], failed: [] };
  let tagIds = null;
  if (input.action === "tag") tagIds = await resolveTagIds(ctx.practiceId, input.tags, { userId: ctx.userId });
  for (const id of input.lead_ids) {
    try {
      if (input.action === "assign") await assignLead(ctx, id, input.owner_id);
      if (input.action === "move") await moveLead(ctx, id, { stage_id: input.stage_id });
      if (input.action === "delete") await deleteLead(ctx, id);
      if (input.action === "tag" || input.action === "untag") {
        await loadLead(ctx, id);
        for (const tagId of input.action === "tag" ? tagIds : input.tag_ids) {
          await exec(
            input.action === "tag"
              ? `INSERT INTO lead_tags (lead_id, tag_id) SELECT :id, t.id FROM tags t WHERE t.id = :tagId AND t.practice_id = :practiceId ON CONFLICT DO NOTHING`
              : `DELETE FROM lead_tags WHERE lead_id = :id AND tag_id = :tagId`,
            { id, tagId, practiceId: ctx.practiceId },
          );
        }
      }
      results.done.push(id);
    } catch (error) {
      results.failed.push({ id, message: error.message });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
const LEAD_COLUMNS = `
  l.id, l.full_name, l.phone, l.email, l.source, l.sub_source, l.status, l.clinic_id,
  l.pipeline_id, l.stage_id, l.owner_id, l.next_follow_up_at, l.last_activity_at,
  l.duplicate_of_id, l.converted_patient_id, l.created_at, l.updated_at,
  s.name AS stage_name, s.color AS stage_color, s.stage_type,
  u.fullname AS owner_name,
  coalesce((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
              FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = l.id), '[]') AS tags`;

const LEAD_FROM = `
  FROM leads l
  JOIN pipeline_stages s ON s.id = l.stage_id
  LEFT JOIN users u ON u.id = l.owner_id`;

async function buildFilters(ctx, query, rawQuery) {
  const scope = await visibility(ctx);
  const where = [`l.practice_id = :practiceId`, `l.deleted_at IS NULL`, ...scope.conditions];
  const params = { practiceId: ctx.practiceId, ...scope.params };
  const eq = (col, key, value) => {
    where.push(`${col} = :${key}`);
    params[key] = value;
  };
  if (query.pipeline_id) eq("l.pipeline_id", "pipelineId", query.pipeline_id);
  if (query.stage_id) eq("l.stage_id", "stageId", query.stage_id);
  if (query.status) eq("l.status", "status", query.status);
  if (query.source) eq("l.source", "source", query.source);
  if (query.clinic_id) eq("l.clinic_id", "clinicId", query.clinic_id);
  if (query.owner_id === "unassigned") where.push(`l.owner_id IS NULL`);
  else if (query.owner_id === "me") eq("l.owner_id", "ownerId", ctx.userId);
  else if (query.owner_id) eq("l.owner_id", "ownerId", query.owner_id);
  if (query.tag_id) {
    where.push(`EXISTS (SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = :tagId)`);
    params.tagId = query.tag_id;
  }
  if (query.created_from) {
    where.push(`l.created_at >= :createdFrom`);
    params.createdFrom = query.created_from;
  }
  if (query.created_to) {
    where.push(`l.created_at <= :createdTo`);
    params.createdTo = query.created_to;
  }
  if (query.q) {
    where.push(`(lower(l.full_name) LIKE :q OR l.phone_normalized LIKE :qDigits OR l.email_normalized LIKE :q OR l.phone LIKE :qRaw)`);
    params.q = `%${query.q.toLowerCase()}%`;
    params.qRaw = `%${query.q}%`;
    params.qDigits = `%${query.q.replace(/\D/g, "") || "__none__"}%`;
  }
  if (query.follow_up === "overdue") where.push(`l.next_follow_up_at < now()`);
  if (query.follow_up === "today") where.push(`l.next_follow_up_at::date = current_date`);
  if (query.follow_up === "upcoming") where.push(`l.next_follow_up_at >= now()`);
  if (query.follow_up === "none") where.push(`l.next_follow_up_at IS NULL`);

  // cf[<key>]=value for filterable custom fields
  const cfEntries = Object.entries(rawQuery)
    .map(([k, v]) => [k.match(/^cf\[(.+)\]$/)?.[1], v])
    .filter(([k]) => k);
  if (cfEntries.length) {
    const fields = await practiceFields(ctx.practiceId);
    cfEntries.forEach(([key, value], i) => {
      const field = fields.find((f) => f.key === key && f.is_filterable);
      if (!field) throw badRequest(`Can't filter by "${key}".`);
      const f = customFilter(field, value, i);
      where.push(f.sql);
      Object.assign(params, f.params);
    });
  }
  return { where, params };
}

export async function listLeads(ctx, query, rawQuery = {}) {
  const { where, params } = await buildFilters(ctx, query, rawQuery);
  const whereSql = where.join(" AND ");
  const sortCol = { created_at: "l.created_at", updated_at: "l.updated_at", next_follow_up_at: "l.next_follow_up_at", full_name: "lower(l.full_name)" }[query.sort];
  const order = `${sortCol} ${query.order === "asc" ? "ASC" : "DESC"} NULLS LAST, l.id`;

  if (query.view === "kanban") {
    if (!query.pipeline_id) throw badRequest("pipeline_id is required for the kanban view.");
    const stages = await select(
      `SELECT id, name, color, stage_type, probability, position FROM pipeline_stages
        WHERE pipeline_id = :pipelineId AND practice_id = :practiceId AND archived_at IS NULL ORDER BY position`,
      params,
    );
    const rows = await select(
      `SELECT * FROM (
         SELECT ${LEAD_COLUMNS},
                row_number() OVER (PARTITION BY l.stage_id ORDER BY ${order}) AS rn,
                count(*) OVER (PARTITION BY l.stage_id)::int AS stage_total
         ${LEAD_FROM} WHERE ${whereSql}
       ) x WHERE rn <= :perStage`,
      { ...params, perStage: query.per_stage },
    );
    const values = await readCustomValues(ctx.practiceId, rows.map((r) => r.id));
    return {
      stages: stages.map((s) => {
        const leads = rows.filter((r) => r.stage_id === s.id);
        return {
          ...s,
          total: leads[0]?.stage_total ?? 0,
          leads: leads.map(({ rn, stage_total, ...l }) => ({ ...l, custom_fields: values[l.id] })),
        };
      }),
    };
  }

  const rows = await select(
    `SELECT ${LEAD_COLUMNS}, count(*) OVER()::int AS total ${LEAD_FROM}
      WHERE ${whereSql} ORDER BY ${order} LIMIT :limit OFFSET :offset`,
    { ...params, limit: query.limit, offset: (query.page - 1) * query.limit },
  );
  const values = await readCustomValues(ctx.practiceId, rows.map((r) => r.id));
  return {
    leads: rows.map(({ total, ...l }) => ({ ...l, custom_fields: values[l.id] })),
    meta: { page: query.page, limit: query.limit, total: rows[0]?.total ?? 0 },
  };
}

// CSV of the leads matching the list filters (same visibility rules).
// Refuses rather than truncates when there are more than the limit.
export async function exportLeads(ctx, query, rawQuery = {}) {
  const { where, params } = await buildFilters(ctx, query, rawQuery);
  const max = config.leads.export_max_rows;
  const [{ total }] = await select(`SELECT count(*)::int AS total FROM leads l WHERE ${where.join(" AND ")}`, params);
  if (total > max) throw badRequest(`${total} leads match; narrow the filters to ${max} or fewer to export.`);

  const rows = await select(
    `SELECT ${LEAD_COLUMNS}, l.notes, l.lost_reason, p.name AS pipeline_name, c.name AS clinic_name
       ${LEAD_FROM}
       JOIN pipelines p ON p.id = l.pipeline_id
       LEFT JOIN clinics c ON c.id = l.clinic_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.created_at DESC, l.id`,
    params,
  );
  const fields = await practiceFields(ctx.practiceId);
  const values = await readCustomValues(ctx.practiceId, rows.map((r) => r.id));
  const iso = (d) => (d ? new Date(d).toISOString() : "");
  const header = [
    "Name", "Phone", "Email", "Pipeline", "Stage", "Status", "Owner", "Clinic", "Source", "Sub-source",
    "Tags", "Next follow-up", "Last activity", "Created", "Lost reason", "Notes",
    ...fields.map((f) => f.label),
  ];
  const lines = rows.map((l) => [
    l.full_name, l.phone, l.email, l.pipeline_name, l.stage_name, l.status, l.owner_name, l.clinic_name ?? "Practice-wide",
    l.source, l.sub_source, (l.tags ?? []).map((t) => t.name).join(", "), iso(l.next_follow_up_at), iso(l.last_activity_at),
    iso(l.created_at), l.lost_reason, l.notes,
    ...fields.map((f) => {
      const v = values[l.id]?.[f.key];
      return Array.isArray(v) ? v.join(", ") : v ?? "";
    }),
  ]);
  return {
    count: rows.length,
    filename: `leads-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: toCsv([header, ...lines], { bom: true }),
  };
}

export async function getLead(ctx, id) {
  await loadLead(ctx, id);
  const lead = await one(
    `SELECT ${LEAD_COLUMNS}, l.notes, l.lost_reason, l.form_id, l.integration_id, l.converted_at,
            p.name AS pipeline_name, c.name AS clinic_name
       ${LEAD_FROM}
       JOIN pipelines p ON p.id = l.pipeline_id
       LEFT JOIN clinics c ON c.id = l.clinic_id
      WHERE l.id = :id`,
    { id },
  );
  const values = await readCustomValues(ctx.practiceId, [id]);
  return { ...lead, custom_fields: values[id] };
}

export async function timeline(ctx, id) {
  await loadLead(ctx, id);
  return select(
    `SELECT a.id, a.type, a.body, a.metadata, a.due_at, a.completed_at, a.created_at,
            a.created_by, u.fullname AS created_by_name
       FROM lead_activities a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.lead_id = :id ORDER BY a.created_at DESC, a.id`,
    { id },
  );
}

export async function createActivity(ctx, leadId, input) {
  return withTransaction(async (transaction) => {
    await loadLead(ctx, leadId, { transaction });
    const row = await addActivity(
      ctx.practiceId,
      leadId,
      { type: input.type, body: input.body, due_at: input.due_at, created_by: ctx.userId },
      { transaction },
    );
    if (input.type === "follow_up") await recomputeFollowUp(leadId, transaction);
    return row;
  });
}

export async function updateActivity(ctx, activityId, input) {
  return withTransaction(async (transaction) => {
    const activity = await one(
      `SELECT a.* FROM lead_activities a WHERE a.id = :activityId AND a.practice_id = :practiceId`,
      { activityId, practiceId: ctx.practiceId },
      { transaction },
    );
    if (!activity) throw notFound("Activity not found.");
    await loadLead(ctx, activity.lead_id, { transaction });
    if (!["note", "call", "whatsapp", "email", "meeting", "follow_up"].includes(activity.type)) {
      throw conflict("System entries can't be edited.");
    }
    const row = await one(
      `UPDATE lead_activities SET
          body = CASE WHEN :setBody THEN :body ELSE body END,
          due_at = CASE WHEN :setDue THEN :dueAt::timestamptz ELSE due_at END,
          reminded_at = CASE WHEN :setDue THEN NULL ELSE reminded_at END,
          completed_at = CASE WHEN :completed IS NULL THEN completed_at WHEN :completed THEN now() ELSE NULL END,
          updated_by = :userId, updated_at = now()
        WHERE id = :activityId RETURNING *`,
      {
        activityId,
        setBody: "body" in input,
        body: input.body ?? null,
        setDue: "due_at" in input,
        dueAt: input.due_at ?? null,
        completed: input.completed ?? null,
        userId: ctx.userId,
      },
      { transaction },
    );
    if (activity.type === "follow_up") await recomputeFollowUp(activity.lead_id, transaction);
    return row;
  });
}

export async function deleteActivity(ctx, activityId) {
  return withTransaction(async (transaction) => {
    const activity = await one(
      `SELECT * FROM lead_activities WHERE id = :activityId AND practice_id = :practiceId`,
      { activityId, practiceId: ctx.practiceId },
      { transaction },
    );
    if (!activity) throw notFound("Activity not found.");
    await loadLead(ctx, activity.lead_id, { transaction });
    if (!["note", "call", "whatsapp", "email", "meeting", "follow_up"].includes(activity.type)) {
      throw conflict("System entries can't be deleted.");
    }
    await exec(`DELETE FROM lead_activities WHERE id = :activityId`, { activityId }, { transaction });
    if (activity.type === "follow_up") await recomputeFollowUp(activity.lead_id, transaction);
  });
}

// Active doctors/staff of the practice (owner pickers, pipeline members).
export function listOwners(ctx) {
  return select(
    `SELECT id, fullname, role FROM users
      WHERE practice_id = :practiceId AND role IN ('doctor', 'staff') AND is_active AND deleted_at IS NULL
      ORDER BY fullname`,
    { practiceId: ctx.practiceId },
  );
}

// Open follow-ups due up to the end of today, for the caller's leads (or
// everyone's with leads.view_all).
export async function dueFollowUps(ctx) {
  const scope = await visibility(ctx);
  return select(
    `SELECT a.id, a.lead_id, a.body, a.due_at, l.full_name, l.phone, l.owner_id, u.fullname AS owner_name
       FROM lead_activities a
       JOIN leads l ON l.id = a.lead_id AND l.deleted_at IS NULL
       LEFT JOIN users u ON u.id = l.owner_id
      WHERE a.practice_id = :practiceId AND a.type = 'follow_up' AND a.completed_at IS NULL
        AND a.due_at < (current_date + 1) ${scope.sql}
      ORDER BY a.due_at LIMIT 200`,
    { practiceId: ctx.practiceId, ...scope.params },
  );
}
