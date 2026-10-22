"use strict";
// Patient messages: automatic recall and birthday messages and bulk
// broadcasts, by WhatsApp (the practice's Cloud API number, approved
// templates) and email (SMTP). Rows in patient_messages are queued
// ('pending'), then the deliver job sends them one by one.
import config from "../../config/index.js";
import { select, one, exec } from "../../db/sql.js";
import { AppError, badRequest, conflict, notFound } from "../../lib/app-error.js";
import { clinicToday } from "../../lib/booking-rules.js";
import { countBodyVariables } from "../../lib/whatsapp/components.js";
import { emailConfigured, mailer } from "../../lib/mailer.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";
import { startConversation, toWaId } from "../whatsapp/service.js";

const KINDS = ["recall", "birthday"];
const DEFAULTS = {
  recall: {
    recall_months: 6,
    email_subject: "Time for your dental check-up",
    email_body: "Hi {{first_name}},\n\nIt's been {{months}} months since your last visit to {{clinic}}. Regular check-ups keep small problems small. Reply to this email or call us to book a convenient time.\n\nSee you soon,\n{{clinic}}",
  },
  birthday: {
    recall_months: 6,
    email_subject: "Happy birthday from {{clinic}}!",
    email_body: "Dear {{first_name}},\n\nEveryone at {{clinic}} wishes you a very happy birthday and a year full of smiles.\n\nWarm wishes,\n{{clinic}}",
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "there";
const titleCase = (name = "") => String(name).replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function fillPlaceholders(text, values) {
  return String(text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key) => (values[key] ?? all));
}

// --- settings --------------------------------------------------------------------

async function whatsappStatus(practiceId) {
  const account = await one(`SELECT is_active FROM whatsapp_accounts WHERE practice_id = :practiceId`, { practiceId });
  return { connected: !!account, active: !!account?.is_active };
}

export async function getSettings(ctx) {
  const rows = await select(
    `SELECT r.*, t.name AS template_name, t.status AS template_status, t.components AS template_components
       FROM patient_message_rules r LEFT JOIN whatsapp_templates t ON t.id = r.whatsapp_template_id
      WHERE r.practice_id = :practiceId`,
    { practiceId: ctx.practiceId },
  );
  const rules = Object.fromEntries(
    KINDS.map((kind) => [kind, rows.find((r) => r.kind === kind) ?? { kind, is_active: false, whatsapp_template_id: null, variable_mapping: [], ...DEFAULTS[kind] }]),
  );
  return { rules, email_configured: await emailConfigured(ctx.practiceId), whatsapp: await whatsappStatus(ctx.practiceId) };
}

async function checkContent(ctx, { whatsapp_template_id: templateId, variable_mapping: mapping = [], email_subject: subject, email_body: body }, { requireChannel }) {
  if (templateId) {
    const t = await one(`SELECT status, components FROM whatsapp_templates WHERE id = :id AND practice_id = :practiceId AND deleted_at IS NULL`, {
      id: templateId,
      practiceId: ctx.practiceId,
    });
    if (!t) throw notFound("WhatsApp template not found.");
    if (t.status !== "APPROVED") throw badRequest("Pick a template Meta has approved.");
    const needed = countBodyVariables(t.components);
    if (mapping.length !== needed) throw badRequest(`This template has ${needed} variable(s). Give each one a value or the patient's name.`);
    if (mapping.some((m) => m.source === "static" && !String(m.value ?? "").trim())) throw badRequest("Every fixed variable needs a value.");
  }
  const hasEmail = !!(subject?.trim() && body?.trim());
  if ((subject?.trim() || body?.trim()) && !hasEmail) throw badRequest("An email needs both a subject and a message.");
  if (requireChannel && !templateId && !hasEmail) throw badRequest("Choose a WhatsApp template, write an email, or both.");
}

export async function saveRule(ctx, kind, input) {
  if (!KINDS.includes(kind)) throw notFound("Unknown message type.");
  await checkContent(ctx, input, { requireChannel: input.is_active });
  await exec(
    `INSERT INTO patient_message_rules (practice_id, kind, is_active, recall_months, whatsapp_template_id, variable_mapping, email_subject, email_body)
     VALUES (:practiceId, :kind, :isActive, :months, :templateId, :mapping::jsonb, :subject, :body)
     ON CONFLICT (practice_id, kind) DO UPDATE SET is_active = EXCLUDED.is_active, recall_months = EXCLUDED.recall_months,
       whatsapp_template_id = EXCLUDED.whatsapp_template_id, variable_mapping = EXCLUDED.variable_mapping,
       email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, updated_at = now()`,
    {
      practiceId: ctx.practiceId,
      kind,
      isActive: input.is_active,
      months: input.recall_months ?? 6,
      templateId: input.whatsapp_template_id ?? null,
      mapping: JSON.stringify(input.variable_mapping ?? []),
      subject: input.email_subject?.trim() || null,
      body: input.email_body?.trim() || null,
    },
  );
  return (await getSettings(ctx)).rules[kind];
}

// --- who is due --------------------------------------------------------------------

const PATIENT_FIELDS = `p.id AS patient_id, u.fullname AS name, u.email, u.country_code, u.mobile_number`;

// Patients whose last visit was `months` ago (within the last week, so a
// missed day still catches up) and who have nothing booked.
export async function recallCandidates(practiceId, months, today) {
  return select(
    `WITH visits AS (
       SELECT p.id AS patient_id,
              greatest(
                (SELECT max(b.date) FROM bookings b WHERE b.patient_id = p.id AND b.status = 'completed'),
                (SELECT max((t.created_at AT TIME ZONE :tz)::date) FROM treatments t WHERE t.patient_id = p.id)
              ) AS last_visit
         FROM patients p WHERE p.practice_id = :practiceId)
     SELECT ${PATIENT_FIELDS}, to_char(v.last_visit, 'YYYY-MM-DD') AS last_visit
       FROM visits v JOIN patients p ON p.id = v.patient_id JOIN users u ON u.id = p.user_id
      WHERE v.last_visit IS NOT NULL AND coalesce(u.is_active, true)
        AND (v.last_visit + make_interval(months => :months))::date BETWEEN :today::date - 6 AND :today::date
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.patient_id = p.id AND b.status = 'pending' AND b.date >= :today::date)
      ORDER BY v.last_visit`,
    { practiceId, months, today, tz: config.clinic_timezone || "Asia/Kolkata" },
  );
}

// Birthdays today (29 Feb birthdays on 28 Feb in other years). Dates of
// birth are text; obviously wrong ones (under a year old) are ignored.
export async function birthdayCandidates(practiceId, today) {
  const [year, month, day] = today.split("-").map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [today.slice(5)];
  if (month === 2 && day === 28 && !leap) days.push("02-29");
  return select(
    `SELECT ${PATIENT_FIELDS}, u.dob FROM patients p JOIN users u ON u.id = p.user_id
      WHERE p.practice_id = :practiceId AND coalesce(u.is_active, true)
        AND u.dob ~ '^\\d{4}-\\d{2}-\\d{2}$' AND substr(u.dob, 6, 5) IN (:days) AND substr(u.dob, 1, 4)::int <= :year - 1
      ORDER BY u.fullname`,
    { practiceId, days, year },
  );
}

// --- queueing ----------------------------------------------------------------------

// One row per channel the content and the patient both allow.
async function queueFor(practiceId, patients, { kind, content, broadcastId = null, keyOf }) {
  let queued = 0;
  for (const p of patients) {
    const targets = [];
    const phone = toWaId(`${p.country_code ?? ""}${p.mobile_number ?? ""}`);
    if (content.whatsapp_template_id && phone) targets.push(["whatsapp", phone]);
    if (content.email_subject && content.email_body && p.email?.includes("@")) targets.push(["email", p.email.trim()]);
    for (const [channel, address] of targets) {
      const row = await one(
        `INSERT INTO patient_messages (practice_id, patient_id, kind, broadcast_id, channel, to_address, dedupe_key)
         VALUES (:practiceId, :patientId, :kind, :broadcastId, :channel, :address, :key)
         ON CONFLICT (practice_id, dedupe_key) DO NOTHING RETURNING id`,
        { practiceId, patientId: p.patient_id, kind, broadcastId, channel, address, key: keyOf(p, channel) },
      );
      if (row) queued += 1;
    }
  }
  return queued;
}

const deliver = (practiceId) => enqueue(QUEUES.PATIENT_MESSAGES_DELIVER, { practiceId }, { singletonKey: `deliver:${practiceId}` });

// Daily: queue today's recall and birthday messages for one practice.
export async function queueDaily(practiceId, today) {
  const rules = await select(`SELECT * FROM patient_message_rules WHERE practice_id = :practiceId AND is_active`, { practiceId });
  let queued = 0;
  for (const rule of rules) {
    if (rule.kind === "recall") {
      const patients = await recallCandidates(practiceId, rule.recall_months, today);
      queued += await queueFor(practiceId, patients, {
        kind: "recall",
        content: rule,
        keyOf: (p, channel) => `recall:${channel}:${p.patient_id}:${p.last_visit}`,
      });
    } else if (rule.kind === "birthday") {
      const patients = await birthdayCandidates(practiceId, today);
      queued += await queueFor(practiceId, patients, {
        kind: "birthday",
        content: rule,
        keyOf: (p, channel) => `birthday:${channel}:${p.patient_id}:${today.slice(0, 4)}`,
      });
    }
  }
  if (queued) await deliver(practiceId);
  return queued;
}

export async function runDaily() {
  const today = await clinicToday();
  const practices = await select(`SELECT DISTINCT practice_id FROM patient_message_rules WHERE is_active`);
  for (const { practice_id: practiceId } of practices) await queueDaily(practiceId, today);
}

// Who today's run would message (for the settings screen).
export async function preview(ctx, kind) {
  const settings = await getSettings(ctx);
  const rule = settings.rules[kind];
  if (!rule) throw notFound("Unknown message type.");
  const today = await clinicToday();
  const patients = kind === "recall" ? await recallCandidates(ctx.practiceId, rule.recall_months, today) : await birthdayCandidates(ctx.practiceId, today);
  return {
    date: today,
    count: patients.length,
    with_email: patients.filter((p) => p.email?.includes("@")).length,
    patients: patients.slice(0, 20).map((p) => ({ patient_id: p.patient_id, name: p.name, last_visit: p.last_visit ?? null, dob: p.dob ?? null })),
  };
}

export async function runNow(ctx) {
  return { queued: await queueDaily(ctx.practiceId, await clinicToday()) };
}

// --- sending -----------------------------------------------------------------------

async function sendOne(row) {
  const content = row.broadcast_id
    ? await one(`SELECT * FROM patient_broadcasts WHERE id = :id`, { id: row.broadcast_id })
    : await one(`SELECT * FROM patient_message_rules WHERE practice_id = :practiceId AND kind = :kind`, { practiceId: row.practice_id, kind: row.kind });
  if (!content) throw new Error("The message settings were removed.");
  const months = content.recall_months ?? null;
  const values = { name: titleCase(row.name), first_name: titleCase(firstName(row.name)), clinic: row.practice_name, months };

  if (row.channel === "email") {
    await mailer.send({
      practiceId: row.practice_id,
      patientId: row.patient_id,
      to: row.to_address,
      subject: fillPlaceholders(content.email_subject, values),
      text: fillPlaceholders(content.email_body, values),
      fromName: row.practice_name,
    });
    return;
  }
  if (!content.whatsapp_template_id) throw new Error("No WhatsApp template is set.");
  const body = (content.variable_mapping ?? []).map((m) => (m.source === "recipient_name" ? values.first_name : String(m.value ?? "")));
  await startConversation(
    { practiceId: row.practice_id, userId: null, system: true },
    { phone: row.to_address, template_id: content.whatsapp_template_id, variables: { body } },
  );
}

// Sends every pending message of a practice, oldest first. Resumable: a
// restart picks up the rows still pending.
export async function deliverPending({ practiceId }) {
  for (;;) {
    const rows = await select(
      `SELECT m.*, u.fullname AS name, pr.name AS practice_name
         FROM patient_messages m JOIN patients p ON p.id = m.patient_id JOIN users u ON u.id = p.user_id
         JOIN practices pr ON pr.id = m.practice_id
        WHERE m.practice_id = :practiceId AND m.status = 'pending' ORDER BY m.created_at LIMIT 100`,
      { practiceId },
    );
    if (!rows.length) break;
    for (const row of rows) {
      try {
        await sendOne(row);
        await exec(`UPDATE patient_messages SET status = 'sent', sent_at = now(), error = NULL WHERE id = :id`, { id: row.id });
      } catch (error) {
        await exec(`UPDATE patient_messages SET status = 'failed', error = left(:error, 1000) WHERE id = :id`, {
          id: row.id,
          error: error?.message ?? String(error),
        });
      }
      if (config.patient_messages.send_interval_ms) await sleep(config.patient_messages.send_interval_ms);
    }
  }
  await exec(
    `UPDATE patient_broadcasts b SET status = 'completed', completed_at = now()
      WHERE b.practice_id = :practiceId AND b.status = 'sending'
        AND NOT EXISTS (SELECT 1 FROM patient_messages m WHERE m.broadcast_id = b.id AND m.status = 'pending')`,
    { practiceId },
  );
}

// --- broadcasts ----------------------------------------------------------------------

// Patients matching a broadcast audience: registered at, booked at or
// treated at the clinic, and last visit within the window.
async function audiencePatients(practiceId, audience = {}) {
  return select(
    `WITH visits AS (
       SELECT p.id AS patient_id,
              greatest(
                (SELECT max(b.date) FROM bookings b WHERE b.patient_id = p.id AND b.status = 'completed'),
                (SELECT max((t.created_at AT TIME ZONE :tz)::date) FROM treatments t WHERE t.patient_id = p.id)
              ) AS last_visit
         FROM patients p WHERE p.practice_id = :practiceId)
     SELECT ${PATIENT_FIELDS} FROM visits v JOIN patients p ON p.id = v.patient_id JOIN users u ON u.id = p.user_id
      WHERE coalesce(u.is_active, true)
        AND (:clinicId::uuid IS NULL
             OR EXISTS (SELECT 1 FROM clinic_patient_mappings cpm WHERE cpm.patient_id = p.id AND cpm.clinic_id = :clinicId)
             OR EXISTS (SELECT 1 FROM bookings b WHERE b.patient_id = p.id AND b.clinic_id = :clinicId)
             OR EXISTS (SELECT 1 FROM treatments t WHERE t.patient_id = p.id AND t.clinic_id = :clinicId))
        AND (:from::date IS NULL OR v.last_visit >= :from::date)
        AND (:to::date IS NULL OR v.last_visit <= :to::date)
      ORDER BY u.fullname`,
    {
      practiceId,
      tz: config.clinic_timezone || "Asia/Kolkata",
      clinicId: audience.clinic_id ?? null,
      from: audience.last_visit_from ?? null,
      to: audience.last_visit_to ?? null,
    },
  );
}

export async function audienceCount(ctx, audience) {
  const patients = await audiencePatients(ctx.practiceId, audience);
  return {
    count: patients.length,
    with_phone: patients.filter((p) => toWaId(`${p.country_code ?? ""}${p.mobile_number ?? ""}`)).length,
    with_email: patients.filter((p) => p.email?.includes("@")).length,
  };
}

const BROADCAST_COLUMNS = `b.*, t.name AS template_name, t.components AS template_components, u.fullname AS created_by_name,
  (SELECT count(*)::int FROM patient_messages m WHERE m.broadcast_id = b.id) AS total,
  (SELECT count(*)::int FROM patient_messages m WHERE m.broadcast_id = b.id AND m.status = 'sent') AS sent,
  (SELECT count(*)::int FROM patient_messages m WHERE m.broadcast_id = b.id AND m.status = 'failed') AS failed,
  (SELECT count(*)::int FROM patient_messages m WHERE m.broadcast_id = b.id AND m.status = 'pending') AS pending`;
const BROADCAST_FROM = `FROM patient_broadcasts b LEFT JOIN whatsapp_templates t ON t.id = b.whatsapp_template_id LEFT JOIN users u ON u.id = b.created_by`;

export async function listBroadcasts(ctx) {
  return select(`SELECT ${BROADCAST_COLUMNS} ${BROADCAST_FROM} WHERE b.practice_id = :practiceId ORDER BY b.created_at DESC LIMIT 100`, {
    practiceId: ctx.practiceId,
  });
}

export async function getBroadcast(ctx, id) {
  const b = await one(`SELECT ${BROADCAST_COLUMNS} ${BROADCAST_FROM} WHERE b.id = :id AND b.practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!b) throw notFound("Message not found.");
  return b;
}

export async function createBroadcast(ctx, input) {
  await checkContent(ctx, input, { requireChannel: true });
  const row = await one(
    `INSERT INTO patient_broadcasts (practice_id, name, audience, whatsapp_template_id, variable_mapping, email_subject, email_body, created_by)
     VALUES (:practiceId, :name, :audience::jsonb, :templateId, :mapping::jsonb, :subject, :body, :userId) RETURNING id`,
    {
      practiceId: ctx.practiceId,
      name: input.name,
      audience: JSON.stringify(input.audience ?? {}),
      templateId: input.whatsapp_template_id ?? null,
      mapping: JSON.stringify(input.variable_mapping ?? []),
      subject: input.email_subject?.trim() || null,
      body: input.email_body?.trim() || null,
      userId: ctx.userId,
    },
  );
  return getBroadcast(ctx, row.id);
}

export async function startBroadcast(ctx, id) {
  const b = await getBroadcast(ctx, id);
  if (b.status !== "draft") throw conflict("This message has already been sent.");
  if (b.whatsapp_template_id && !(await whatsappStatus(ctx.practiceId)).active) {
    throw new AppError(409, "Connect and switch on WhatsApp before sending.", { code: "WHATSAPP_INACTIVE" });
  }
  const emailReady = await emailConfigured(ctx.practiceId);
  if (!b.whatsapp_template_id && !emailReady) throw new AppError(409, "Email isn't set up. Add your email account in Settings › Email.", { code: "EMAIL_NOT_CONFIGURED" });
  const patients = await audiencePatients(ctx.practiceId, b.audience);
  const queued = await queueFor(ctx.practiceId, patients, {
    kind: "broadcast",
    content: { ...b, email_subject: emailReady ? b.email_subject : null },
    broadcastId: b.id,
    keyOf: (p, channel) => `broadcast:${b.id}:${channel}:${p.patient_id}`,
  });
  if (!queued) throw badRequest("No patient in this audience can be reached by the chosen channels.");
  await exec(`UPDATE patient_broadcasts SET status = 'sending', started_at = now() WHERE id = :id`, { id });
  await deliver(ctx.practiceId);
  return getBroadcast(ctx, id);
}

// --- log -----------------------------------------------------------------------------

export async function listMessages(ctx, { kind, status, broadcast_id: broadcastId, page = 1, limit = 50 }) {
  const rows = await select(
    `SELECT m.id, m.kind, m.channel, m.to_address, m.status, m.error, m.sent_at, m.created_at, m.broadcast_id, m.patient_id,
            u.fullname AS patient_name, count(*) OVER()::int AS total
       FROM patient_messages m JOIN patients p ON p.id = m.patient_id JOIN users u ON u.id = p.user_id
      WHERE m.practice_id = :practiceId
        AND (:kind::text IS NULL OR m.kind::text = :kind) AND (:status::text IS NULL OR m.status::text = :status)
        AND (:broadcastId::uuid IS NULL OR m.broadcast_id = :broadcastId)
      ORDER BY m.created_at DESC LIMIT :limit OFFSET :offset`,
    { practiceId: ctx.practiceId, kind: kind ?? null, status: status ?? null, broadcastId: broadcastId ?? null, limit, offset: (page - 1) * limit },
  );
  return { messages: rows.map(({ total, ...r }) => r), meta: { page, limit, total: rows[0]?.total ?? 0 } };
}

export async function retryFailed(ctx, { broadcast_id: broadcastId } = {}) {
  const rows = await select(
    `UPDATE patient_messages SET status = 'pending', error = NULL
      WHERE practice_id = :practiceId AND status = 'failed' AND (:broadcastId::uuid IS NULL OR broadcast_id = :broadcastId)
      RETURNING id`,
    { practiceId: ctx.practiceId, broadcastId: broadcastId ?? null },
  );
  if (!rows.length) throw badRequest("There are no failed messages to retry.");
  if (broadcastId) await exec(`UPDATE patient_broadcasts SET status = 'sending', completed_at = NULL WHERE id = :id`, { id: broadcastId });
  await deliver(ctx.practiceId);
  return { retried: rows.length };
}
