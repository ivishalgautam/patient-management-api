"use strict";
import crypto from "crypto";
import slugify from "slugify";
import config from "../../config/index.js";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { AppError, badRequest, notFound } from "../../lib/app-error.js";
import { coerceValue, practiceFields } from "../../lib/leads/custom-values.js";
import {
  checkRenderToken,
  hashIp,
  issueRenderToken,
  sanitizeText,
  turnstileEnabled,
  verifyTurnstile,
} from "../../lib/leads/form-spam.js";
import { createLead, systemContext } from "../lead/service.js";

const CORE_META = {
  full_name: { label: "Full name", field_type: "text" },
  phone: { label: "Phone", field_type: "phone" },
  email: { label: "Email", field_type: "email" },
  notes: { label: "Message", field_type: "textarea" },
};

const shareUrl = (slug) => `${config.app_url}/f/${slug}`;
const embedCode = (slug) =>
  `<iframe src="${shareUrl(slug)}" style="width:100%;min-height:640px;border:0" loading="lazy" title="Enquiry form"></iframe>`;

async function validateTargets(ctx, input, transaction) {
  const stage = await one(
    `SELECT s.id FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id
      WHERE s.id = :stageId AND s.pipeline_id = :pipelineId AND s.practice_id = :practiceId
        AND s.archived_at IS NULL AND p.archived_at IS NULL`,
    { stageId: input.stage_id, pipelineId: input.pipeline_id, practiceId: ctx.practiceId },
    { transaction },
  );
  if (!stage) throw badRequest("Choose an active stage of the selected pipeline.");
  if (input.clinic_id) {
    const clinic = await one(`SELECT 1 FROM clinics WHERE id = :c AND practice_id = :p`, { c: input.clinic_id, p: ctx.practiceId }, { transaction });
    if (!clinic) throw badRequest("Clinic not found in this practice.");
  }
  if (input.assignment === "fixed") {
    const owner = await one(
      `SELECT 1 FROM users WHERE id = :u AND practice_id = :p AND role IN ('doctor','staff') AND is_active AND deleted_at IS NULL`,
      { u: input.fixed_owner_id, p: ctx.practiceId },
      { transaction },
    );
    if (!owner) throw badRequest("The lead owner must be an active team member.");
  }
  const customIds = input.fields.filter((f) => f.source === "custom").map((f) => f.custom_field_id);
  if (customIds.length) {
    const found = await select(
      `SELECT id FROM custom_fields WHERE id IN (:ids) AND practice_id = :p AND archived_at IS NULL`,
      { ids: customIds, p: ctx.practiceId },
      { transaction },
    );
    if (found.length !== new Set(customIds).size) throw badRequest("Unknown custom field in the form.");
  }
  const keys = input.fields.map((f) => f.core_key ?? f.custom_field_id);
  if (new Set(keys).size !== keys.length) throw badRequest("A field can appear only once in a form.");
}

async function writeFields(ctx, formId, fields, transaction) {
  await exec(`DELETE FROM form_fields WHERE form_id = :formId`, { formId }, { transaction });
  for (const [position, f] of fields.entries()) {
    await exec(
      `INSERT INTO form_fields (practice_id, form_id, source, core_key, custom_field_id, label_override,
                                placeholder, is_required, validation, section, position, width)
       VALUES (:practiceId, :formId, :source, :coreKey, :customFieldId, :label, :placeholder, :required,
               :validation::jsonb, :section, :position, :width)`,
      {
        practiceId: ctx.practiceId,
        formId,
        source: f.source,
        coreKey: f.source === "core" ? f.core_key : null,
        customFieldId: f.source === "custom" ? f.custom_field_id : null,
        label: f.label_override ?? null,
        placeholder: f.placeholder ?? null,
        // A form must always collect the name.
        required: f.core_key === "full_name" ? true : !!f.is_required,
        validation: JSON.stringify(f.validation ?? {}),
        section: f.section ?? null,
        position,
        width: f.width ?? "full",
      },
      { transaction },
    );
  }
}

export async function listForms(ctx) {
  const forms = await select(
    `SELECT f.id, f.name, f.slug, f.is_active, f.pipeline_id, f.stage_id, f.clinic_id, f.created_at,
            p.name AS pipeline_name, s.name AS stage_name,
            (SELECT count(*)::int FROM form_submissions fs WHERE fs.form_id = f.id) AS submissions,
            (SELECT count(*)::int FROM leads l WHERE l.form_id = f.id AND l.deleted_at IS NULL) AS leads
       FROM forms f JOIN pipelines p ON p.id = f.pipeline_id JOIN pipeline_stages s ON s.id = f.stage_id
      WHERE f.practice_id = :practiceId AND f.deleted_at IS NULL ORDER BY f.created_at DESC`,
    { practiceId: ctx.practiceId },
  );
  return forms.map((f) => ({ ...f, share_url: shareUrl(f.slug) }));
}

export async function getForm(ctx, id) {
  const form = await one(
    `SELECT * FROM forms WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`,
    { id, practiceId: ctx.practiceId },
  );
  if (!form) throw notFound("Form not found.");
  const fields = await select(`SELECT * FROM form_fields WHERE form_id = :id ORDER BY position`, { id });
  return { ...form, fields, share_url: shareUrl(form.slug), embed_code: embedCode(form.slug) };
}

export async function createForm(ctx, input) {
  return withTransaction(async (transaction) => {
    await validateTargets(ctx, input, transaction);
    const slug = `${slugify(input.name, { lower: true, strict: true }).slice(0, 60) || "form"}-${crypto.randomBytes(3).toString("hex")}`;
    const form = await one(
      `INSERT INTO forms (practice_id, clinic_id, name, slug, pipeline_id, stage_id, is_active, settings,
                          assignment, fixed_owner_id, created_by)
       VALUES (:practiceId, :clinicId, :name, :slug, :pipelineId, :stageId, coalesce(:isActive, true),
               :settings::jsonb, :assignment, :fixedOwner, :userId) RETURNING id`,
      {
        practiceId: ctx.practiceId,
        clinicId: input.clinic_id ?? null,
        name: input.name,
        slug,
        pipelineId: input.pipeline_id,
        stageId: input.stage_id,
        isActive: input.is_active ?? null,
        settings: JSON.stringify(input.settings ?? {}),
        assignment: input.assignment,
        fixedOwner: input.assignment === "fixed" ? input.fixed_owner_id : null,
        userId: ctx.userId,
      },
      { transaction },
    );
    await writeFields(ctx, form.id, input.fields, transaction);
    return form;
  }).then((form) => getForm(ctx, form.id));
}

export async function updateForm(ctx, id, input) {
  await withTransaction(async (transaction) => {
    const existing = await one(`SELECT 1 FROM forms WHERE id = :id AND practice_id = :p AND deleted_at IS NULL FOR UPDATE`, { id, p: ctx.practiceId }, { transaction });
    if (!existing) throw notFound("Form not found.");
    await validateTargets(ctx, input, transaction);
    await exec(
      `UPDATE forms SET name = :name, clinic_id = :clinicId, pipeline_id = :pipelineId, stage_id = :stageId,
              is_active = coalesce(:isActive, is_active), settings = :settings::jsonb, assignment = :assignment,
              fixed_owner_id = :fixedOwner, updated_by = :userId, updated_at = now()
        WHERE id = :id`,
      {
        id,
        name: input.name,
        clinicId: input.clinic_id ?? null,
        pipelineId: input.pipeline_id,
        stageId: input.stage_id,
        isActive: input.is_active ?? null,
        settings: JSON.stringify(input.settings ?? {}),
        assignment: input.assignment,
        fixedOwner: input.assignment === "fixed" ? input.fixed_owner_id : null,
        userId: ctx.userId,
      },
      { transaction },
    );
    await writeFields(ctx, id, input.fields, transaction);
  });
  return getForm(ctx, id);
}

export async function deleteForm(ctx, id) {
  const [, meta] = await exec(
    `UPDATE forms SET deleted_at = now(), is_active = false, updated_by = :userId
      WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`,
    { id, practiceId: ctx.practiceId, userId: ctx.userId },
  );
  if (!meta.rowCount) throw notFound("Form not found.");
}

export async function listSubmissions(ctx, id, { page = 1, limit = 20 } = {}) {
  await getForm(ctx, id);
  const rows = await select(
    `SELECT id, lead_id, status, error, payload, created_at, count(*) OVER()::int AS total
       FROM form_submissions WHERE form_id = :id ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
    { id, limit, offset: (page - 1) * limit },
  );
  return { submissions: rows.map(({ total, ...r }) => r), meta: { page, limit, total: rows[0]?.total ?? 0 } };
}

// ---------------------------------------------------------------------------
// Public side

async function loadPublicForm(slug) {
  const form = await one(
    `SELECT f.*, s.archived_at AS stage_archived, p.archived_at AS pipeline_archived
       FROM forms f JOIN pipeline_stages s ON s.id = f.stage_id JOIN pipelines p ON p.id = f.pipeline_id
      WHERE f.slug = :slug AND f.deleted_at IS NULL`,
    { slug },
  );
  if (!form || !form.is_active || form.stage_archived || form.pipeline_archived) {
    throw notFound("This form is not available.");
  }
  const fields = await select(
    `SELECT ff.*, cf.key AS cf_key, cf.label AS cf_label, cf.field_type AS cf_type, cf.options AS cf_options
       FROM form_fields ff LEFT JOIN custom_fields cf ON cf.id = ff.custom_field_id
      WHERE ff.form_id = :id AND (ff.source = 'core' OR cf.archived_at IS NULL)
      ORDER BY ff.position`,
    { id: form.id },
  );
  const publicFields = fields.map((f) => ({
    key: f.source === "core" ? f.core_key : f.cf_key,
    source: f.source,
    custom_field_id: f.custom_field_id,
    label: f.label_override || (f.source === "core" ? CORE_META[f.core_key].label : f.cf_label),
    type: f.source === "core" ? CORE_META[f.core_key].field_type : f.cf_type,
    options: f.source === "core" ? [] : f.cf_options,
    placeholder: f.placeholder,
    required: f.is_required,
    validation: f.validation,
    section: f.section,
    width: f.width,
  }));
  return { form, fields: publicFields };
}

const spamSettings = (form) => ({
  honeypot: form.settings?.spam?.honeypot !== false,
  minSeconds: form.settings?.spam?.min_seconds ?? 3,
  turnstile: !!form.settings?.spam?.turnstile && turnstileEnabled(),
});

export async function publicDefinition(slug) {
  const { form, fields } = await loadPublicForm(slug);
  const spam = spamSettings(form);
  const s = form.settings ?? {};
  return {
    name: form.name,
    title: s.title ?? form.name,
    description: s.description ?? null,
    submit_label: s.submit_label ?? "Send",
    theme_color: s.theme_color ?? null,
    fields,
    token: issueRenderToken(form.id),
    honeypot_field: spam.honeypot ? "_hp" : null,
    turnstile_site_key: spam.turnstile ? config.turnstile.site_key : null,
  };
}

function validateValues(fields, values) {
  const errors = {};
  const core = {};
  const custom = {};
  for (const f of fields) {
    const raw = values[f.key];
    const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && !raw.length);
    if (empty) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    const text = Array.isArray(raw) ? raw.map((v) => sanitizeText(v, 120)) : sanitizeText(raw, f.type === "textarea" ? 5000 : 500);
    const v = f.validation ?? {};
    if (typeof text === "string") {
      if (v.min !== undefined && text.length < v.min) errors[f.key] = `${f.label} is too short`;
      if (v.max !== undefined && text.length > v.max) errors[f.key] = `${f.label} is too long`;
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(text)) errors[f.key] = `${f.label} is not valid`;
        } catch {
          /* invalid admin pattern: ignore */
        }
      }
    }
    if (f.source === "core") {
      if (f.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[f.key] = "Enter a valid email";
      if (f.key === "phone" && text.replace(/\D/g, "").length < 7) errors[f.key] = "Enter a valid phone number";
      core[f.key] = text;
    } else {
      try {
        coerceValue({ label: f.label, field_type: f.type, options: f.options }, text);
        custom[f.key] = text;
      } catch (error) {
        errors[f.key] = error.message;
      }
    }
  }
  if (!core.phone && !core.email && !errors.phone && !errors.email) errors.phone = "Enter a phone number or email";
  return { errors, core, custom };
}

// Spam is answered like a success (bots learn nothing) but no lead is made.
export async function submit(slug, input, { ip, userAgent } = {}) {
  const { form, fields } = await loadPublicForm(slug);
  const spam = spamSettings(form);
  const record = (status, extra = {}) =>
    exec(
      `INSERT INTO form_submissions (practice_id, form_id, lead_id, payload, ip_hash, user_agent, status, error)
       VALUES (:practiceId, :formId, :leadId, :payload::jsonb, :ipHash, :ua, :status, :error)`,
      {
        practiceId: form.practice_id,
        formId: form.id,
        leadId: extra.leadId ?? null,
        payload: JSON.stringify(input.values ?? {}),
        ipHash: hashIp(ip),
        ua: userAgent ? String(userAgent).slice(0, 255) : null,
        status,
        error: extra.error ?? null,
      },
    );
  const thanks = {
    message: form.settings?.thank_you_message ?? "Thank you! We'll contact you shortly.",
    redirect_url: form.settings?.redirect_url ?? null,
  };

  const spamReason =
    (spam.honeypot && input._hp ? "honeypot filled" : null) ??
    checkRenderToken(input._token, form.id, spam.minSeconds);
  if (spamReason) {
    await record("spam", { error: spamReason });
    return thanks;
  }
  if (spam.turnstile && !(await verifyTurnstile(input.turnstile_token, ip).catch(() => false))) {
    await record("spam", { error: "turnstile failed" });
    throw badRequest("Please complete the verification and try again.");
  }

  const { errors, core, custom } = validateValues(fields, input.values ?? {});
  if (Object.keys(errors).length) {
    throw new AppError(400, "Please check the highlighted fields.", { code: "INVALID_FIELDS", details: { errors } });
  }

  try {
    const known = new Set((await practiceFields(form.practice_id)).map((f) => f.key));
    const result = await createLead(
      systemContext(form.practice_id),
      {
        full_name: core.full_name,
        phone: core.phone ?? null,
        email: core.email ?? null,
        notes: core.notes ?? null,
        pipeline_id: form.pipeline_id,
        stage_id: form.stage_id,
        clinic_id: form.clinic_id,
        source: form.settings?.source ?? "Website",
        sub_source: form.name,
        custom_fields: Object.fromEntries(Object.entries(custom).filter(([k]) => known.has(k))),
      },
      {
        dedupe: form.settings?.dedupe ?? "merge",
        assignment: form.assignment === "fixed" ? { fixed: form.fixed_owner_id } : form.assignment,
        formId: form.id,
        via: { type: "form", activityType: "form_submission", body: `Submitted "${form.name}"`, metadata: { form_id: form.id } },
      },
    );
    await record(result.created ? "accepted" : "duplicate", { leadId: result.lead.id });
    return thanks;
  } catch (error) {
    await record("error", { error: error.message });
    if (error.statusCode && error.statusCode < 500) throw error;
    throw new AppError(500, "We couldn't send your enquiry. Please try again.");
  }
}
