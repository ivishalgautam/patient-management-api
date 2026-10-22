"use strict";
// Email campaigns: one template to many recipients — leads (by pipeline,
// stages and status), patients (by clinic and last visit) or an uploaded
// list. Recipients are snapshotted when the campaign starts; sending is
// paced by the email.campaign job and resumable.
import config from "../../config/index.js";
import { select, one, exec } from "../../db/sql.js";
import { badRequest, conflict, notFound } from "../../lib/app-error.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";
import { assertEnabled, sendingAccount, variablesFor } from "./common.js";
import { getTemplate, renderTemplate } from "./templates.service.js";
import { queueOutbound } from "./messages.service.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLUMNS = `c.*, t.name AS template_name, t.subject AS template_subject, a.email_address AS account_email, u.fullname AS created_by_name,
  (SELECT count(*)::int FROM email_campaign_recipients r WHERE r.campaign_id = c.id) AS total,
  (SELECT count(*)::int FROM email_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'sent') AS sent,
  (SELECT count(*)::int FROM email_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'failed') AS failed,
  (SELECT count(*)::int FROM email_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'pending') AS pending`;
const FROM = `FROM email_campaigns c JOIN email_templates t ON t.id = c.template_id
  LEFT JOIN email_accounts a ON a.id = c.account_id LEFT JOIN users u ON u.id = c.created_by`;

export async function listCampaigns(ctx) {
  return select(`SELECT ${COLUMNS} ${FROM} WHERE c.practice_id = :practiceId ORDER BY c.created_at DESC LIMIT 200`, { practiceId: ctx.practiceId });
}

export async function getCampaign(ctx, id) {
  const c = await one(`SELECT ${COLUMNS} ${FROM} WHERE c.id = :id AND c.practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!c) throw notFound("Campaign not found.");
  return c;
}

// Who an audience matches right now (for counts and the start snapshot).
async function audienceRows(practiceId, type, audience = {}) {
  if (type === "leads") {
    if (!audience.pipeline_id) throw badRequest("Choose a pipeline.");
    return select(
      `SELECT l.id AS lead_id, NULL::uuid AS patient_id, l.email AS email_address, l.full_name AS fullname
         FROM leads l
        WHERE l.practice_id = :practiceId AND l.deleted_at IS NULL AND l.pipeline_id = :pipelineId
          AND coalesce(l.email, '') <> '' AND (:stageCount = 0 OR l.stage_id IN (:stageIds))
          AND (:status = 'all' OR l.status::text = :status)
        ORDER BY l.created_at`,
      {
        practiceId,
        pipelineId: audience.pipeline_id,
        stageIds: audience.stage_ids?.length ? audience.stage_ids : ["00000000-0000-0000-0000-000000000000"],
        stageCount: audience.stage_ids?.length ?? 0,
        status: audience.status ?? "open",
      },
    );
  }
  if (type === "patients") {
    return select(
      `WITH visits AS (
         SELECT p.id, greatest((SELECT max(b.date) FROM bookings b WHERE b.patient_id = p.id AND b.status = 'completed'),
                               (SELECT max(t.created_at::date) FROM treatments t WHERE t.patient_id = p.id)) AS last_visit
           FROM patients p WHERE p.practice_id = :practiceId)
       SELECT NULL::uuid AS lead_id, p.id AS patient_id, u.email AS email_address, u.fullname
         FROM visits v JOIN patients p ON p.id = v.id JOIN users u ON u.id = p.user_id
        WHERE coalesce(u.email, '') <> '' AND coalesce(u.is_active, true)
          AND (:clinicId::uuid IS NULL
               OR EXISTS (SELECT 1 FROM clinic_patient_mappings m WHERE m.patient_id = p.id AND m.clinic_id = :clinicId)
               OR EXISTS (SELECT 1 FROM bookings b WHERE b.patient_id = p.id AND b.clinic_id = :clinicId))
          AND (:from::date IS NULL OR v.last_visit >= :from::date) AND (:to::date IS NULL OR v.last_visit <= :to::date)
        ORDER BY u.fullname`,
      { practiceId, clinicId: audience.clinic_id ?? null, from: audience.last_visit_from ?? null, to: audience.last_visit_to ?? null },
    );
  }
  return [];
}

export async function audiencePreview(ctx, { audience_type: type, audience }) {
  const rows = await audienceRows(ctx.practiceId, type, audience);
  const valid = rows.filter((r) => EMAIL.test(String(r.email_address).trim()));
  return { count: valid.length, sample: valid.slice(0, 8).map((r) => ({ name: r.fullname, email: r.email_address })) };
}

async function checkRefs(ctx, input) {
  await getTemplate(ctx, input.template_id);
  if (input.account_id) await sendingAccount(ctx, input.account_id);
}

export async function createCampaign(ctx, input) {
  await assertEnabled(ctx);
  await checkRefs(ctx, input);
  const row = await one(
    `INSERT INTO email_campaigns (practice_id, name, template_id, account_id, audience_type, audience, created_by)
     VALUES (:practiceId, :name, :templateId, :accountId, :type, :audience::jsonb, :userId) RETURNING id`,
    {
      practiceId: ctx.practiceId,
      name: input.name,
      templateId: input.template_id,
      accountId: input.account_id ?? null,
      type: input.audience_type,
      audience: JSON.stringify(input.audience ?? {}),
      userId: ctx.userId,
    },
  );
  return getCampaign(ctx, row.id);
}

export async function updateCampaign(ctx, id, input) {
  const c = await getCampaign(ctx, id);
  if (c.status !== "draft") throw conflict("Only a draft campaign can be edited.");
  const next = { ...c, ...input };
  await checkRefs(ctx, next);
  await exec(
    `UPDATE email_campaigns SET name = :name, template_id = :templateId, account_id = :accountId, audience_type = :type,
            audience = :audience::jsonb, updated_at = now() WHERE id = :id`,
    { id, name: next.name, templateId: next.template_id, accountId: next.account_id ?? null, type: next.audience_type, audience: JSON.stringify(next.audience ?? {}) },
  );
  return getCampaign(ctx, id);
}

export async function deleteCampaign(ctx, id) {
  const c = await getCampaign(ctx, id);
  if (c.status === "sending") throw conflict("Cancel the campaign before deleting it.");
  await exec(`DELETE FROM email_campaigns WHERE id = :id`, { id });
}

// Uploaded list (CSV rows already parsed in the browser): email + name.
export async function uploadRecipients(ctx, id, { recipients, replace = false }) {
  const c = await getCampaign(ctx, id);
  if (c.status !== "draft") throw conflict("Recipients can only be changed on a draft.");
  if (c.audience_type !== "upload") throw badRequest("This campaign's audience isn't an uploaded list.");
  if (replace) await exec(`DELETE FROM email_campaign_recipients WHERE campaign_id = :id`, { id });
  let added = 0;
  let invalid = 0;
  for (const r of recipients) {
    const email = String(r.email ?? "").trim();
    if (!EMAIL.test(email)) {
      invalid += 1;
      continue;
    }
    const row = await one(
      `INSERT INTO email_campaign_recipients (campaign_id, practice_id, email_address, fullname) VALUES (:id, :practiceId, :email, :name)
       ON CONFLICT DO NOTHING RETURNING id`,
      { id, practiceId: ctx.practiceId, email, name: r.name?.trim() || null },
    );
    if (row) added += 1;
  }
  return { added, invalid, duplicates: recipients.length - added - invalid, campaign: await getCampaign(ctx, id) };
}

export async function listRecipients(ctx, id, { status } = {}) {
  await getCampaign(ctx, id);
  return select(
    `SELECT r.*, l.full_name AS lead_name, pu.fullname AS patient_name FROM email_campaign_recipients r
       LEFT JOIN leads l ON l.id = r.lead_id LEFT JOIN patients p ON p.id = r.patient_id LEFT JOIN users pu ON pu.id = p.user_id
      WHERE r.campaign_id = :id AND (:status::text IS NULL OR r.status::text = :status)
      ORDER BY r.fullname NULLS LAST, r.email_address LIMIT 2000`,
    { id, status: status ?? null },
  );
}

async function snapshot(ctx, c) {
  if (c.audience_type === "upload") return;
  for (const r of await audienceRows(ctx.practiceId, c.audience_type, c.audience)) {
    const email = String(r.email_address).trim();
    if (!EMAIL.test(email)) continue;
    await exec(
      `INSERT INTO email_campaign_recipients (campaign_id, practice_id, lead_id, patient_id, email_address, fullname)
       VALUES (:id, :practiceId, :leadId, :patientId, :email, :name) ON CONFLICT DO NOTHING`,
      { id: c.id, practiceId: ctx.practiceId, leadId: r.lead_id, patientId: r.patient_id, email, name: r.fullname },
    );
  }
}

async function begin(ctx, c) {
  await snapshot(ctx, c);
  const { n } = await one(`SELECT count(*)::int AS n FROM email_campaign_recipients WHERE campaign_id = :id AND status = 'pending'`, { id: c.id });
  if (!n) throw badRequest("Nobody in this audience has an email address.");
  await exec(`UPDATE email_campaigns SET status = 'sending', started_at = coalesce(started_at, now()), updated_at = now() WHERE id = :id`, { id: c.id });
  await enqueue(QUEUES.EMAIL_CAMPAIGN, { campaignId: c.id }, { singletonKey: c.id });
}

export async function sendNow(ctx, id) {
  await assertEnabled(ctx);
  const c = await getCampaign(ctx, id);
  if (!["draft", "scheduled"].includes(c.status)) throw conflict("This campaign has already been sent.");
  await sendingAccount(ctx, c.account_id ?? null);
  await begin(ctx, c);
  return getCampaign(ctx, id);
}

export async function schedule(ctx, id, { scheduled_at: at }) {
  const c = await getCampaign(ctx, id);
  if (!["draft", "scheduled"].includes(c.status)) throw conflict("This campaign has already been sent.");
  if (new Date(at) <= new Date()) throw badRequest("Pick a time in the future.");
  await sendingAccount(ctx, c.account_id ?? null);
  if (c.audience_type !== "upload") {
    const { count } = await audiencePreview(ctx, c);
    if (!count) throw badRequest("Nobody in this audience has an email address.");
  }
  await exec(`UPDATE email_campaigns SET status = 'scheduled', scheduled_at = :at, updated_at = now() WHERE id = :id`, { id, at });
  return getCampaign(ctx, id);
}

export async function cancel(ctx, id) {
  const c = await getCampaign(ctx, id);
  if (!["scheduled", "sending"].includes(c.status)) throw conflict("Only a scheduled or sending campaign can be cancelled.");
  await exec(`UPDATE email_campaigns SET status = 'cancelled', updated_at = now() WHERE id = :id`, { id });
  await exec(`UPDATE email_campaign_recipients SET status = 'skipped' WHERE campaign_id = :id AND status = 'pending'`, { id });
  return getCampaign(ctx, id);
}

// --- jobs ----------------------------------------------------------------------------

// email.campaign: queues each pending recipient's message (the email.send
// job sends it), pausing between them. Stops if the campaign is cancelled.
export async function runCampaign({ campaignId }) {
  const c = await one(`SELECT * FROM email_campaigns WHERE id = :id`, { id: campaignId });
  if (!c || c.status !== "sending") return;
  const ctx = { practiceId: c.practice_id, userId: c.created_by, system: true };
  const template = await one(`SELECT * FROM email_templates WHERE id = :id`, { id: c.template_id });
  let account;
  let settings;
  try {
    ({ account, settings } = await sendingAccount(ctx, c.account_id ?? null));
  } catch (error) {
    await exec(`UPDATE email_campaign_recipients SET status = 'failed', error_message = :m WHERE campaign_id = :id AND status = 'pending'`, {
      id: c.id,
      m: error.message,
    });
    await exec(`UPDATE email_campaigns SET status = 'sent', sent_at = now() WHERE id = :id`, { id: c.id });
    return;
  }
  for (;;) {
    const current = await one(`SELECT status FROM email_campaigns WHERE id = :id`, { id: c.id });
    if (current?.status !== "sending") return;
    const r = await one(`SELECT * FROM email_campaign_recipients WHERE campaign_id = :id AND status = 'pending' AND message_id IS NULL ORDER BY id LIMIT 1`, {
      id: c.id,
    });
    if (!r) break;
    const values = await variablesFor(c.practice_id, { leadId: r.lead_id, patientId: r.patient_id, name: r.fullname, email: r.email_address });
    const rendered = renderTemplate(template, values);
    const messageId = await queueOutbound(ctx, {
      account,
      settings,
      to: [r.email_address],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: template.id,
      campaignId: c.id,
      leadId: r.lead_id,
      patientId: r.patient_id,
    });
    await exec(`UPDATE email_campaign_recipients SET message_id = :messageId WHERE id = :id`, { id: r.id, messageId });
    if (config.email?.campaign_interval_ms) await sleep(config.email.campaign_interval_ms);
  }
  await exec(`UPDATE email_campaigns SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = :id AND status = 'sending'`, { id: c.id });
}

// email.campaign-dispatch (every minute): starts scheduled campaigns that are due.
export async function dispatchScheduled() {
  const due = await select(`SELECT * FROM email_campaigns WHERE status = 'scheduled' AND scheduled_at <= now()`);
  for (const c of due) {
    const ctx = { practiceId: c.practice_id, userId: c.created_by, system: true };
    try {
      await begin(ctx, c);
    } catch (error) {
      await exec(`UPDATE email_campaigns SET status = 'draft', updated_at = now() WHERE id = :id`, { id: c.id });
      console.error("[email] scheduled campaign could not start", c.id, error.message);
    }
  }
}
