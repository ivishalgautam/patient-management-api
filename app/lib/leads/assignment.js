"use strict";
import { select, one, exec } from "../../db/sql.js";

// Round-robin owner from the pipeline's members (ported from the reference).
// The pipeline row is locked, so concurrent leads can't land on the same
// "next" member. Returns null when the pipeline has no members.
export async function nextRoundRobinOwner(pipelineId, { transaction }) {
  const pipeline = await one(
    `SELECT last_assigned_user_id FROM pipelines WHERE id = :pipelineId FOR UPDATE`,
    { pipelineId },
    { transaction },
  );
  if (!pipeline) return null;
  const members = await select(
    `SELECT m.user_id FROM pipeline_members m
       JOIN users u ON u.id = m.user_id AND u.is_active AND u.deleted_at IS NULL
      WHERE m.pipeline_id = :pipelineId
      ORDER BY m.created_at, m.user_id`,
    { pipelineId },
    { transaction },
  );
  if (!members.length) return null;
  const current = members.findIndex((m) => m.user_id === pipeline.last_assigned_user_id);
  const next = members[(current + 1) % members.length].user_id;
  await exec(
    `UPDATE pipelines SET last_assigned_user_id = :next WHERE id = :pipelineId`,
    { next, pipelineId },
    { transaction },
  );
  return next;
}
