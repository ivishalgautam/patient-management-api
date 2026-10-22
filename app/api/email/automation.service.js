"use strict";
// Email automation: send a template when a lead is created or reaches a
// pipeline stage. Lead events are queued after the lead's transaction
// commits (lib/email/events.js); each rule runs at most once per event.
import { select, one, exec } from "../../db/sql.js";
import { badRequest, notFound } from "../../lib/app-error.js";
import { sendingAccount, variablesFor } from "./common.js";
import { getTemplate, renderTemplate } from "./templates.service.js";
import { queueOutbound } from "./messages.service.js";

export const TRIGGERS = [
  { value: "lead_created", label: "New lead created" },
  { value: "stage_reached", label: "Lead reaches a pipeline stage" },
];

const COLUMNS = `r.*, t.name AS template_name, p.name AS pipeline_name, s.name AS stage_name, a.email_address AS account_email,
  (SELECT count(*)::int FROM email_automation_runs x WHERE x.rule_id = r.id AND x.status = 'sent') AS sent_count,
  (SELECT count(*)::int FROM email_automation_runs x WHERE x.rule_id = r.id AND x.status = 'failed') AS failed_count,
  (SELECT max(x.created_at) FROM email_automation_runs x WHERE x.rule_id = r.id) AS last_run_at`;
const FROM = `FROM email_automation_rules r JOIN email_templates t ON t.id = r.template_id
  LEFT JOIN pipelines p ON p.id = r.pipeline_id LEFT JOIN pipeline_stages s ON s.id = r.stage_id
  LEFT JOIN email_accounts a ON a.id = r.account_id`;

export function listRules(ctx) {
  return select(`SELECT ${COLUMNS} ${FROM} WHERE r.practice_id = :practiceId ORDER BY r.created_at DESC`, { practiceId: ctx.practiceId });
}

export async function getRule(ctx, id) {
  const r = await one(`SELECT ${COLUMNS} ${FROM} WHERE r.id = :id AND r.practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!r) throw notFound("Automation not found.");
  return r;
}

async function check(ctx, input) {
  await getTemplate(ctx, input.template_id);
  if (input.account_id) await sendingAccount(ctx, input.account_id);
  if (input.trigger_type === "stage_reached") {
    if (!input.stage_id) throw badRequest("Choose the stage that sends this email.");
    const stage = await one(`SELECT pipeline_id FROM pipeline_stages WHERE id = :id AND practice_id = :practiceId`, { id: input.stage_id, practiceId: ctx.practiceId });
    if (!stage) throw notFound("Stage not found.");
    return { pipeline_id: stage.pipeline_id, stage_id: input.stage_id };
  }
  if (input.pipeline_id) {
    const p = await one(`SELECT 1 FROM pipelines WHERE id = :id AND practice_id = :practiceId`, { id: input.pipeline_id, practiceId: ctx.practiceId });
    if (!p) throw notFound("Pipeline not found.");
  }
  return { pipeline_id: input.pipeline_id ?? null, stage_id: null };
}

export async function createRule(ctx, input) {
  const scope = await check(ctx, input);
  const row = await one(
    `INSERT INTO email_automation_rules (practice_id, name, trigger_type, pipeline_id, stage_id, template_id, account_id, is_active, created_by, updated_by)
     VALUES (:practiceId, :name, :trigger, :pipelineId, :stageId, :templateId, :accountId, :active, :userId, :userId) RETURNING id`,
    {
      practiceId: ctx.practiceId,
      name: input.name,
      trigger: input.trigger_type,
      pipelineId: scope.pipeline_id,
      stageId: scope.stage_id,
      templateId: input.template_id,
      accountId: input.account_id ?? null,
      active: input.is_active ?? true,
      userId: ctx.userId,
    },
  );
  return getRule(ctx, row.id);
}

export async function updateRule(ctx, id, input) {
  const current = await getRule(ctx, id);
  const next = { ...current, ...input };
  const scope = await check(ctx, next);
  await exec(
    `UPDATE email_automation_rules SET name = :name, trigger_type = :trigger, pipeline_id = :pipelineId, stage_id = :stageId,
            template_id = :templateId, account_id = :accountId, is_active = :active, updated_by = :userId, updated_at = now()
      WHERE id = :id`,
    {
      id,
      name: next.name,
      trigger: next.trigger_type,
      pipelineId: scope.pipeline_id,
      stageId: scope.stage_id,
      templateId: next.template_id,
      accountId: next.account_id ?? null,
      active: next.is_active,
      userId: ctx.userId,
    },
  );
  return getRule(ctx, id);
}

export async function deleteRule(ctx, id) {
  await getRule(ctx, id);
  await exec(`DELETE FROM email_automation_rules WHERE id = :id`, { id });
}

export async function listRuns(ctx, { rule_id: ruleId, page = 1, limit = 50 } = {}) {
  const rows = await select(
    `SELECT x.*, r.name AS rule_name, l.full_name AS lead_name, l.email AS lead_email, count(*) OVER()::int AS total
       FROM email_automation_runs x JOIN email_automation_rules r ON r.id = x.rule_id LEFT JOIN leads l ON l.id = x.lead_id
      WHERE x.practice_id = :practiceId AND (:ruleId::uuid IS NULL OR x.rule_id = :ruleId)
      ORDER BY x.created_at DESC LIMIT :limit OFFSET :offset`,
    { practiceId: ctx.practiceId, ruleId: ruleId ?? null, limit, offset: (page - 1) * limit },
  );
  return { runs: rows.map(({ total, ...r }) => r), meta: { page, limit, total: rows[0]?.total ?? 0 } };
}

// --- job -------------------------------------------------------------------------------

// email.automation: { type: 'lead_created' | 'stage_reached', practiceId, leadId, stageId?, eventId }
export async function handleLeadEvent({ type, practiceId, leadId, stageId = null, eventId }) {
  const settings = await one(`SELECT is_enabled FROM email_settings WHERE practice_id = :practiceId`, { practiceId });
  if (settings && !settings.is_enabled) return;
  const lead = await one(`SELECT id, pipeline_id, stage_id, email FROM leads WHERE id = :leadId AND deleted_at IS NULL`, { leadId });
  if (!lead) return;
  const rules = await select(
    `SELECT * FROM email_automation_rules WHERE practice_id = :practiceId AND is_active AND trigger_type = :type
        AND (pipeline_id IS NULL OR pipeline_id = :pipelineId) AND (:type <> 'stage_reached' OR stage_id = :stageId)`,
    { practiceId, type, pipelineId: lead.pipeline_id, stageId },
  );
  for (const rule of rules) {
    const eventKey = `${type}:${leadId}:${eventId}`;
    const run = await one(
      `INSERT INTO email_automation_runs (rule_id, practice_id, lead_id, event_key, status) VALUES (:ruleId, :practiceId, :leadId, :eventKey, 'skipped')
       ON CONFLICT (rule_id, event_key) DO NOTHING RETURNING id`,
      { ruleId: rule.id, practiceId, leadId, eventKey },
    );
    if (!run) continue; // already handled this event
    if (!lead.email?.includes("@")) {
      await exec(`UPDATE email_automation_runs SET error_message = 'The lead has no email address.' WHERE id = :id`, { id: run.id });
      continue;
    }
    try {
      const ctx = { practiceId, userId: rule.created_by, system: true };
      const { account, settings: emailSettings } = await sendingAccount(ctx, rule.account_id ?? null);
      const template = await one(`SELECT * FROM email_templates WHERE id = :id AND deleted_at IS NULL`, { id: rule.template_id });
      if (!template) throw new Error("The template was deleted.");
      const rendered = renderTemplate(template, await variablesFor(practiceId, { leadId }));
      const messageId = await queueOutbound(ctx, {
        account,
        settings: emailSettings,
        to: [lead.email.trim()],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        templateId: template.id,
        leadId,
      });
      // 'sent' once the email.send job delivers it; failures update the run.
      await exec(`UPDATE email_automation_runs SET status = 'sent', message_id = :messageId WHERE id = :id`, { id: run.id, messageId });
    } catch (error) {
      await exec(`UPDATE email_automation_runs SET status = 'failed', error_message = left(:m, 1000) WHERE id = :id`, { id: run.id, m: error.message });
    }
  }
}
