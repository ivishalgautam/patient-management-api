"use strict";
// Email templates: built from blocks (drag and drop) or written as HTML.
// Blocks are compiled to body_html / body_text on save, so sending only
// ever fills {{variables}} into those.
import { select, one, exec } from "../../db/sql.js";
import { badRequest, conflict, notFound } from "../../lib/app-error.js";
import { compileBlocksToHtml, compileBlocksToText, fill, htmlToText, VARIABLES } from "../../lib/email/blocks.js";
import { variablesFor } from "./common.js";

export const CATEGORIES = ["general", "follow_up", "reminder", "marketing", "welcome", "transactional"];

function compile(input) {
  if (input.builder_type === "html") {
    const html = String(input.body_html ?? "");
    if (/<script/i.test(html)) throw badRequest("Scripts aren't allowed in email templates.");
    return { content_blocks: [], body_html: html, body_text: input.body_text?.trim() || htmlToText(html) };
  }
  const blocks = input.content_blocks ?? [];
  if (!blocks.length) throw badRequest("Add at least one block.");
  return { content_blocks: blocks, body_html: compileBlocksToHtml(blocks), body_text: compileBlocksToText(blocks) };
}

export function listTemplates(ctx, { q, category, active } = {}) {
  return select(
    `SELECT t.id, t.name, t.subject, t.category, t.builder_type, t.is_active, t.updated_at, t.created_at, u.fullname AS updated_by_name,
            (SELECT count(*)::int FROM email_messages m WHERE m.template_id = t.id AND m.status = 'sent') AS sent_count
       FROM email_templates t LEFT JOIN users u ON u.id = t.updated_by
      WHERE t.practice_id = :practiceId AND t.deleted_at IS NULL
        AND (:q::text IS NULL OR t.name ILIKE :like OR t.subject ILIKE :like)
        AND (:category::text IS NULL OR t.category = :category)
        AND (:active::boolean IS NULL OR t.is_active = :active)
      ORDER BY t.updated_at DESC`,
    { practiceId: ctx.practiceId, q: q ?? null, like: `%${q ?? ""}%`, category: category ?? null, active: active ?? null },
  );
}

export async function getTemplate(ctx, id) {
  const t = await one(`SELECT * FROM email_templates WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`, {
    id,
    practiceId: ctx.practiceId,
  });
  if (!t) throw notFound("Template not found.");
  return t;
}

export async function createTemplate(ctx, input) {
  const compiled = compile(input);
  const row = await one(
    `INSERT INTO email_templates (practice_id, name, subject, category, builder_type, content_blocks, body_html, body_text, is_active, created_by, updated_by)
     VALUES (:practiceId, :name, :subject, :category, :builderType, :blocks::jsonb, :html, :text, :active, :userId, :userId) RETURNING id`,
    {
      practiceId: ctx.practiceId,
      name: input.name,
      subject: input.subject,
      category: input.category ?? "general",
      builderType: input.builder_type ?? "blocks",
      blocks: JSON.stringify(compiled.content_blocks),
      html: compiled.body_html,
      text: compiled.body_text,
      active: input.is_active ?? true,
      userId: ctx.userId,
    },
  );
  return getTemplate(ctx, row.id);
}

export async function updateTemplate(ctx, id, input) {
  const current = await getTemplate(ctx, id);
  const next = { ...current, ...input };
  const compiled =
    input.content_blocks || input.body_html !== undefined || input.builder_type
      ? compile(next)
      : { content_blocks: current.content_blocks, body_html: current.body_html, body_text: current.body_text };
  await exec(
    `UPDATE email_templates SET name = :name, subject = :subject, category = :category, builder_type = :builderType,
            content_blocks = :blocks::jsonb, body_html = :html, body_text = :text, is_active = :active, updated_by = :userId, updated_at = now()
      WHERE id = :id`,
    {
      id,
      name: next.name,
      subject: next.subject,
      category: next.category,
      builderType: next.builder_type,
      blocks: JSON.stringify(compiled.content_blocks),
      html: compiled.body_html,
      text: compiled.body_text,
      active: next.is_active,
      userId: ctx.userId,
    },
  );
  return getTemplate(ctx, id);
}

export async function duplicateTemplate(ctx, id) {
  const t = await getTemplate(ctx, id);
  return createTemplate(ctx, { ...t, name: `${t.name} (copy)` });
}

export async function deleteTemplate(ctx, id) {
  await getTemplate(ctx, id);
  const inUse = await one(
    `SELECT (SELECT count(*) FROM email_automation_rules WHERE template_id = :id AND is_active)::int AS rules,
            (SELECT count(*) FROM email_campaigns WHERE template_id = :id AND status IN ('scheduled', 'sending'))::int AS campaigns`,
    { id },
  );
  if (inUse.rules || inUse.campaigns) throw conflict("This template is used by an active automation or a scheduled campaign.");
  await exec(`UPDATE email_templates SET deleted_at = now() WHERE id = :id`, { id });
}

// Fills a template for one recipient (or sample values).
export function renderTemplate(template, values) {
  return {
    subject: fill(template.subject, values),
    html: fill(template.body_html, values, { html: true }),
    text: fill(template.body_text, values),
  };
}

export async function previewTemplate(ctx, id, { lead_id: leadId, patient_id: patientId } = {}) {
  const t = await getTemplate(ctx, id);
  const values = leadId || patientId
    ? await variablesFor(ctx.practiceId, { leadId, patientId })
    : { ...(await variablesFor(ctx.practiceId, {})), name: "Asha Patel", first_name: "Asha", email: "asha@example.com", phone: "98xxxxxx01", stage: "Consultation booked", pipeline: "New patients" };
  return renderTemplate(t, values);
}

// Renders unsaved blocks/HTML (live preview in the builder).
export async function previewDraft(ctx, input) {
  const compiled = compile({ builder_type: "blocks", ...input });
  const values = { ...(await variablesFor(ctx.practiceId, {})), name: "Asha Patel", first_name: "Asha", email: "asha@example.com", phone: "98xxxxxx01", stage: "Consultation booked", pipeline: "New patients" };
  return renderTemplate({ subject: input.subject ?? "", ...compiled }, values);
}

export const templateMeta = () => ({ categories: CATEGORIES, variables: VARIABLES });
