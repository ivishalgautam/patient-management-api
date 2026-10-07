"use strict";
import slugify from "slugify";
import { select, one, exec } from "../../db/sql.js";
import { badRequest, conflict, notFound } from "../../lib/app-error.js";
import { ensureLeadDefaults } from "../../lib/leads/defaults.js";

export async function listCustomFields(ctx, { includeArchived = false } = {}) {
  await ensureLeadDefaults(ctx.practiceId);
  return select(
    `SELECT id, key, label, field_type, options, is_filterable, position, archived_at
       FROM custom_fields
      WHERE practice_id = :practiceId AND entity = 'lead' ${includeArchived ? "" : "AND archived_at IS NULL"}
      ORDER BY position, created_at`,
    { practiceId: ctx.practiceId },
  );
}

export async function createCustomField(ctx, input) {
  const key =
    input.key ??
    slugify(input.label, { lower: true, strict: true, replacement: "_" })
      .replace(/^[^a-z]+/, "")
      .slice(0, 64);
  if (!key) throw badRequest("Could not derive a key from the label; provide one.");
  const exists = await one(
    `SELECT 1 FROM custom_fields WHERE practice_id = :practiceId AND entity = 'lead' AND key = :key`,
    { practiceId: ctx.practiceId, key },
  );
  if (exists) throw conflict(`A custom field with key "${key}" already exists.`);
  const { next } = await one(
    `SELECT coalesce(max(position) + 1, 0) AS next FROM custom_fields WHERE practice_id = :practiceId`,
    { practiceId: ctx.practiceId },
  );
  return one(
    `INSERT INTO custom_fields (practice_id, key, label, field_type, options, is_filterable, position, created_by)
     VALUES (:practiceId, :key, :label, :type, :options::jsonb, :filterable, :position, :userId) RETURNING *`,
    {
      practiceId: ctx.practiceId,
      key,
      label: input.label,
      type: input.field_type,
      options: JSON.stringify(input.options ?? []),
      filterable: input.is_filterable ?? false,
      position: input.position ?? next,
      userId: ctx.userId,
    },
  );
}

// The type and key are fixed once created (stored values depend on them).
export async function updateCustomField(ctx, id, input) {
  const field = await one(
    `SELECT field_type FROM custom_fields WHERE id = :id AND practice_id = :practiceId`,
    { id, practiceId: ctx.practiceId },
  );
  if (!field) throw notFound("Custom field not found.");
  if (input.options && ["dropdown", "multi_select"].includes(field.field_type) && !input.options.length) {
    throw badRequest("Options are required for dropdown and multi-select fields.");
  }
  return one(
    `UPDATE custom_fields SET
        label = coalesce(:label, label),
        options = coalesce(:options::jsonb, options),
        is_filterable = coalesce(:filterable, is_filterable),
        position = coalesce(:position, position),
        updated_by = :userId, updated_at = now()
      WHERE id = :id RETURNING *`,
    {
      id,
      label: input.label ?? null,
      options: input.options ? JSON.stringify(input.options) : null,
      filterable: input.is_filterable ?? null,
      position: input.position ?? null,
      userId: ctx.userId,
    },
  );
}

export async function archiveCustomField(ctx, id, archived) {
  const [, meta] = await exec(
    `UPDATE custom_fields SET archived_at = ${archived ? "now()" : "NULL"}, updated_at = now(), updated_by = :userId
      WHERE id = :id AND practice_id = :practiceId`,
    { id, practiceId: ctx.practiceId, userId: ctx.userId },
  );
  if (!meta.rowCount) throw notFound("Custom field not found.");
}
