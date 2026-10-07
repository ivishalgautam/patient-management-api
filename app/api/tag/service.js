"use strict";
import { select, one, exec } from "../../db/sql.js";
import { conflict, notFound } from "../../lib/app-error.js";

export const listTags = (ctx) =>
  select(
    `SELECT t.id, t.name, t.color,
            (SELECT count(*)::int FROM lead_tags lt JOIN leads l ON l.id = lt.lead_id
              WHERE lt.tag_id = t.id AND l.deleted_at IS NULL) AS lead_count
       FROM tags t WHERE t.practice_id = :practiceId ORDER BY lower(t.name)`,
    { practiceId: ctx.practiceId },
  );

export async function createTag(ctx, { name, color }) {
  const exists = await one(
    `SELECT id FROM tags WHERE practice_id = :practiceId AND lower(name) = lower(:name)`,
    { practiceId: ctx.practiceId, name },
  );
  if (exists) throw conflict(`Tag "${name}" already exists.`);
  return one(
    `INSERT INTO tags (practice_id, name, color, created_by)
     VALUES (:practiceId, :name, coalesce(:color, '#64748b'), :userId) RETURNING *`,
    { practiceId: ctx.practiceId, name, color: color ?? null, userId: ctx.userId },
  );
}

export async function deleteTag(ctx, id) {
  const [, meta] = await exec(`DELETE FROM tags WHERE id = :id AND practice_id = :practiceId`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!meta.rowCount) throw notFound("Tag not found.");
}

// Finds or creates tags by name for a practice; returns their ids.
export async function resolveTagIds(practiceId, names = [], { transaction, userId } = {}) {
  const ids = [];
  for (const raw of names) {
    const name = String(raw).trim().slice(0, 60);
    if (!name) continue;
    const tag =
      (await one(
        `SELECT id FROM tags WHERE practice_id = :practiceId AND lower(name) = lower(:name)`,
        { practiceId, name },
        { transaction },
      )) ??
      (await one(
        `INSERT INTO tags (practice_id, name, created_by) VALUES (:practiceId, :name, :userId)
         ON CONFLICT (practice_id, lower(name)) DO UPDATE SET name = tags.name RETURNING id`,
        { practiceId, name, userId: userId ?? null },
        { transaction },
      ));
    ids.push(tag.id);
  }
  return [...new Set(ids)];
}
