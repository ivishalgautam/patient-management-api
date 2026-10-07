"use strict";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { badRequest, conflict, notFound } from "../../lib/app-error.js";
import { DEFAULT_PIPELINE, ensureLeadDefaults } from "../../lib/leads/defaults.js";

// Pipelines with their ordered stages and live lead counts per stage.
export async function listPipelines(ctx, { includeArchived = false } = {}) {
  await ensureLeadDefaults(ctx.practiceId);
  const pipelines = await select(
    `SELECT id, name, clinic_id, is_default, archived_at, created_at
       FROM pipelines
      WHERE practice_id = :practiceId ${includeArchived ? "" : "AND archived_at IS NULL"}
      ORDER BY is_default DESC, created_at`,
    { practiceId: ctx.practiceId },
  );
  if (!pipelines.length) return [];
  const stages = await select(
    `SELECT s.id, s.pipeline_id, s.name, s.position, s.color, s.probability, s.stage_type,
            s.required_fields,
            (SELECT count(*)::int FROM leads l WHERE l.stage_id = s.id AND l.deleted_at IS NULL) AS lead_count
       FROM pipeline_stages s
      WHERE s.pipeline_id IN (:ids) AND s.archived_at IS NULL
      ORDER BY s.position`,
    { ids: pipelines.map((p) => p.id) },
  );
  return pipelines.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) }));
}

export async function getPipeline(ctx, id) {
  const pipelines = await listPipelines(ctx, { includeArchived: true });
  const pipeline = pipelines.find((p) => p.id === id);
  if (!pipeline) throw notFound("Pipeline not found.");
  const members = await select(
    `SELECT m.user_id, u.fullname FROM pipeline_members m JOIN users u ON u.id = m.user_id
      WHERE m.pipeline_id = :id ORDER BY m.created_at`,
    { id },
  );
  return { ...pipeline, members };
}

async function assertClinic(ctx, clinicId, transaction) {
  if (!clinicId) return;
  const clinic = await one(
    `SELECT 1 FROM clinics WHERE id = :clinicId AND practice_id = :practiceId`,
    { clinicId, practiceId: ctx.practiceId },
    { transaction },
  );
  if (!clinic) throw badRequest("Clinic not found in this practice.");
}

async function assertRequiredFields(ctx, keys = [], transaction) {
  const custom = keys.filter((k) => k.startsWith("cf:")).map((k) => k.slice(3));
  if (!custom.length) return;
  const found = await select(
    `SELECT key FROM custom_fields WHERE practice_id = :practiceId AND key IN (:custom) AND archived_at IS NULL`,
    { practiceId: ctx.practiceId, custom },
    { transaction },
  );
  const missing = custom.filter((k) => !found.some((f) => f.key === k));
  if (missing.length) throw badRequest(`Unknown custom field(s): ${missing.join(", ")}`);
}

async function insertStage(ctx, pipelineId, stage, position, transaction) {
  return one(
    `INSERT INTO pipeline_stages
       (practice_id, pipeline_id, name, position, color, probability, stage_type, required_fields, created_by)
     VALUES (:practiceId, :pipelineId, :name, :position, :color, :probability, :stageType, :required::jsonb, :userId)
     RETURNING *`,
    {
      practiceId: ctx.practiceId,
      pipelineId,
      name: stage.name,
      position,
      color: stage.color ?? "#64748b",
      probability: stage.probability ?? 0,
      stageType: stage.stage_type ?? "open",
      required: JSON.stringify(stage.required_fields ?? []),
      userId: ctx.userId,
    },
    { transaction },
  );
}

export async function createPipeline(ctx, input) {
  return withTransaction(async (transaction) => {
    await assertClinic(ctx, input.clinic_id, transaction);
    const stages = input.stages ?? DEFAULT_PIPELINE.stages;
    for (const s of stages) await assertRequiredFields(ctx, s.required_fields, transaction);
    const pipeline = await one(
      `INSERT INTO pipelines (practice_id, clinic_id, name, created_by)
       VALUES (:practiceId, :clinicId, :name, :userId) RETURNING *`,
      { practiceId: ctx.practiceId, clinicId: input.clinic_id ?? null, name: input.name, userId: ctx.userId },
      { transaction },
    );
    for (const [i, s] of stages.entries()) await insertStage(ctx, pipeline.id, s, i, transaction);
    return pipeline;
  });
}

export async function updatePipeline(ctx, id, input) {
  await assertClinic(ctx, input.clinic_id);
  const row = await one(
    `UPDATE pipelines SET
        name = coalesce(:name, name),
        clinic_id = CASE WHEN :setClinic THEN :clinicId::uuid ELSE clinic_id END,
        updated_by = :userId, updated_at = now()
      WHERE id = :id AND practice_id = :practiceId RETURNING *`,
    {
      id,
      practiceId: ctx.practiceId,
      name: input.name ?? null,
      setClinic: "clinic_id" in input,
      clinicId: input.clinic_id ?? null,
      userId: ctx.userId,
    },
  );
  if (!row) throw notFound("Pipeline not found.");
  return row;
}

export async function setDefaultPipeline(ctx, id) {
  return withTransaction(async (transaction) => {
    const target = await one(
      `SELECT id, archived_at FROM pipelines WHERE id = :id AND practice_id = :practiceId FOR UPDATE`,
      { id, practiceId: ctx.practiceId },
      { transaction },
    );
    if (!target) throw notFound("Pipeline not found.");
    if (target.archived_at) throw conflict("An archived pipeline can't be the default.");
    await exec(`UPDATE pipelines SET is_default = false WHERE practice_id = :practiceId AND is_default`, { practiceId: ctx.practiceId }, { transaction });
    await exec(`UPDATE pipelines SET is_default = true, updated_at = now() WHERE id = :id`, { id }, { transaction });
  });
}

export async function archivePipeline(ctx, id, archived) {
  const pipeline = await one(
    `SELECT id, is_default FROM pipelines WHERE id = :id AND practice_id = :practiceId`,
    { id, practiceId: ctx.practiceId },
  );
  if (!pipeline) throw notFound("Pipeline not found.");
  if (archived && pipeline.is_default) {
    throw conflict("Make another pipeline the default before archiving this one.");
  }
  await exec(
    `UPDATE pipelines SET archived_at = ${archived ? "now()" : "NULL"}, updated_at = now(), updated_by = :userId WHERE id = :id`,
    { id, userId: ctx.userId },
  );
}

// Hard delete only for pipelines that never had leads; otherwise archive.
export async function deletePipeline(ctx, id) {
  const pipeline = await one(
    `SELECT id, is_default, (SELECT count(*)::int FROM leads WHERE pipeline_id = :id) AS leads,
            (SELECT count(*)::int FROM forms WHERE pipeline_id = :id AND deleted_at IS NULL) AS forms
       FROM pipelines WHERE id = :id AND practice_id = :practiceId`,
    { id, practiceId: ctx.practiceId },
  );
  if (!pipeline) throw notFound("Pipeline not found.");
  if (pipeline.is_default) throw conflict("The default pipeline can't be deleted.");
  if (pipeline.leads || pipeline.forms) {
    throw conflict("This pipeline has leads or forms. Archive it instead.", { code: "ARCHIVE_INSTEAD" });
  }
  await exec(`DELETE FROM pipelines WHERE id = :id`, { id });
}

export async function setMembers(ctx, id, userIds) {
  return withTransaction(async (transaction) => {
    const pipeline = await one(`SELECT 1 FROM pipelines WHERE id = :id AND practice_id = :practiceId`, { id, practiceId: ctx.practiceId }, { transaction });
    if (!pipeline) throw notFound("Pipeline not found.");
    if (userIds.length) {
      const valid = await select(
        `SELECT id FROM users WHERE id IN (:userIds) AND practice_id = :practiceId
            AND role IN ('doctor', 'staff') AND deleted_at IS NULL AND is_active`,
        { userIds, practiceId: ctx.practiceId },
        { transaction },
      );
      if (valid.length !== new Set(userIds).size) throw badRequest("Members must be active staff of this practice.");
    }
    await exec(`DELETE FROM pipeline_members WHERE pipeline_id = :id`, { id }, { transaction });
    for (const userId of new Set(userIds)) {
      await exec(
        `INSERT INTO pipeline_members (practice_id, pipeline_id, user_id) VALUES (:practiceId, :id, :userId)`,
        { practiceId: ctx.practiceId, id, userId },
        { transaction },
      );
    }
  });
}

export async function addStage(ctx, pipelineId, input) {
  return withTransaction(async (transaction) => {
    const pipeline = await one(`SELECT 1 FROM pipelines WHERE id = :pipelineId AND practice_id = :practiceId FOR UPDATE`, { pipelineId, practiceId: ctx.practiceId }, { transaction });
    if (!pipeline) throw notFound("Pipeline not found.");
    await assertRequiredFields(ctx, input.required_fields, transaction);
    const { next } = await one(
      `SELECT coalesce(max(position) + 1, 0) AS next FROM pipeline_stages WHERE pipeline_id = :pipelineId`,
      { pipelineId },
      { transaction },
    );
    return insertStage(ctx, pipelineId, input, next, transaction);
  });
}

export async function updateStage(ctx, stageId, input) {
  await assertRequiredFields(ctx, input.required_fields);
  const row = await one(
    `UPDATE pipeline_stages SET
        name = coalesce(:name, name),
        color = coalesce(:color, color),
        probability = coalesce(:probability, probability),
        stage_type = coalesce(:stageType::enum_pipeline_stages_stage_type, stage_type),
        required_fields = coalesce(:required::jsonb, required_fields),
        updated_by = :userId, updated_at = now()
      WHERE id = :stageId AND practice_id = :practiceId RETURNING *`,
    {
      stageId,
      practiceId: ctx.practiceId,
      name: input.name ?? null,
      color: input.color ?? null,
      probability: input.probability ?? null,
      stageType: input.stage_type ?? null,
      required: input.required_fields ? JSON.stringify(input.required_fields) : null,
      userId: ctx.userId,
    },
  );
  if (!row) throw notFound("Stage not found.");
  return row;
}

// stage_ids must list every active stage of the pipeline, in the new order.
export async function reorderStages(ctx, pipelineId, stageIds) {
  return withTransaction(async (transaction) => {
    const stages = await select(
      `SELECT id FROM pipeline_stages WHERE pipeline_id = :pipelineId AND practice_id = :practiceId AND archived_at IS NULL`,
      { pipelineId, practiceId: ctx.practiceId },
      { transaction },
    );
    if (!stages.length) throw notFound("Pipeline not found.");
    const current = new Set(stages.map((s) => s.id));
    if (stageIds.length !== current.size || !stageIds.every((id) => current.has(id))) {
      throw badRequest("stage_ids must contain every stage of the pipeline exactly once.");
    }
    await exec(`SET CONSTRAINTS pipeline_stages_position_key DEFERRED`, {}, { transaction });
    for (const [position, id] of stageIds.entries()) {
      await exec(`UPDATE pipeline_stages SET position = :position, updated_at = now() WHERE id = :id`, { id, position }, { transaction });
    }
  });
}

export async function deleteStage(ctx, stageId) {
  return withTransaction(async (transaction) => {
    const stage = await one(
      `SELECT s.id, s.pipeline_id,
              (SELECT count(*)::int FROM leads WHERE stage_id = s.id) AS leads,
              (SELECT count(*)::int FROM forms WHERE stage_id = s.id AND deleted_at IS NULL) AS forms,
              (SELECT count(*)::int FROM pipeline_stages o WHERE o.pipeline_id = s.pipeline_id AND o.archived_at IS NULL) AS siblings
         FROM pipeline_stages s WHERE s.id = :stageId AND s.practice_id = :practiceId`,
      { stageId, practiceId: ctx.practiceId },
      { transaction },
    );
    if (!stage) throw notFound("Stage not found.");
    if (stage.leads || stage.forms) throw conflict("Move this stage's leads (and forms) to another stage first.");
    if (stage.siblings <= 1) throw conflict("A pipeline needs at least one stage.");
    await exec(`DELETE FROM pipeline_stages WHERE id = :stageId`, { stageId }, { transaction });
    // Close the gap in positions.
    const rest = await select(`SELECT id FROM pipeline_stages WHERE pipeline_id = :p ORDER BY position`, { p: stage.pipeline_id }, { transaction });
    await exec(`SET CONSTRAINTS pipeline_stages_position_key DEFERRED`, {}, { transaction });
    for (const [position, s] of rest.entries()) {
      await exec(`UPDATE pipeline_stages SET position = :position WHERE id = :id`, { id: s.id, position }, { transaction });
    }
  });
}
