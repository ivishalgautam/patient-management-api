"use strict";
// The mailbox: outbound messages (queued, then sent by the email.send job)
// and inbound ones pulled from each account's IMAP inbox. Replies keep the
// thread (In-Reply-To / References); mail is linked to the matching lead
// or patient by address.
import { simpleParser } from "mailparser";
import { select, one, exec } from "../../db/sql.js";
import { AppError, badRequest, notFound } from "../../lib/app-error.js";
import { textToHtml, fill } from "../../lib/email/blocks.js";
import { imap, imapOptions, passwordOf, sendFromAccount, friendlyError } from "../../lib/email/transport.js";
import { QUEUES, enqueue } from "../../jobs/queue.js";
import { assertEnabled, matchContact, sendingAccount, variablesFor } from "./common.js";
import { getTemplate, renderTemplate } from "./templates.service.js";

const FIRST_SYNC_LOOKBACK_DAYS = 3;
// A Postgres text[] literal, quoting each value.
const pgArray = (list = []) => `{${list.map((v) => `"${String(v).replace(/["\\]/g, (c) => `\\${c}`)}"`).join(",")}}`;
const MAX_PER_SYNC = 200;

const LIST_COLUMNS = `m.id, m.account_id, m.direction, m.folder, m.status, m.from_address, m.from_name, m.to_addresses, m.subject,
  left(coalesce(m.body_text, ''), 160) AS snippet, m.is_read, m.error_message, m.thread_id, m.lead_id, m.patient_id, m.campaign_id,
  m.template_id, m.sent_at, m.received_at, m.created_at, coalesce(m.received_at, m.sent_at, m.created_at) AS at,
  a.email_address AS account_email, l.full_name AS lead_name, pu.fullname AS patient_name`;
const LIST_FROM = `FROM email_messages m
  LEFT JOIN email_accounts a ON a.id = m.account_id
  LEFT JOIN leads l ON l.id = m.lead_id
  LEFT JOIN patients pt ON pt.id = m.patient_id LEFT JOIN users pu ON pu.id = pt.user_id`;

export async function listMessages(ctx, query) {
  await assertEnabled(ctx);
  const where = [`m.practice_id = :practiceId`];
  const params = { practiceId: ctx.practiceId, limit: query.limit, offset: (query.page - 1) * query.limit };
  const add = (sql, key, value) => {
    where.push(sql);
    params[key] = value;
  };
  if (query.folder === "failed") where.push(`m.status = 'failed' AND m.folder <> 'trash'`);
  else if (query.folder) add(`m.folder = :folder`, "folder", query.folder);
  if (query.account_id) add(`m.account_id = :accountId`, "accountId", query.account_id);
  if (query.lead_id) add(`m.lead_id = :leadId`, "leadId", query.lead_id);
  if (query.patient_id) add(`m.patient_id = :patientId`, "patientId", query.patient_id);
  if (query.unread) where.push(`NOT m.is_read`);
  if (query.q) add(`(m.subject ILIKE :q OR m.from_address ILIKE :q OR array_to_string(m.to_addresses, ',') ILIKE :q OR m.body_text ILIKE :q)`, "q", `%${query.q}%`);
  const rows = await select(
    `SELECT ${LIST_COLUMNS}, count(*) OVER()::int AS total ${LIST_FROM}
      WHERE ${where.join(" AND ")} ORDER BY coalesce(m.received_at, m.sent_at, m.created_at) DESC LIMIT :limit OFFSET :offset`,
    params,
  );
  const [counts] = await select(
    `SELECT count(*) FILTER (WHERE folder = 'inbox' AND NOT is_read)::int AS unread,
            count(*) FILTER (WHERE status = 'failed' AND folder <> 'trash')::int AS failed,
            count(*) FILTER (WHERE status = 'queued')::int AS queued
       FROM email_messages WHERE practice_id = :practiceId`,
    { practiceId: ctx.practiceId },
  );
  return { messages: rows.map(({ total, ...m }) => m), meta: { page: query.page, limit: query.limit, total: rows[0]?.total ?? 0, counts } };
}

async function loadMessage(ctx, id) {
  const m = await one(`SELECT m.*, a.email_address AS account_email, l.full_name AS lead_name, pu.fullname AS patient_name ${LIST_FROM}
                        WHERE m.id = :id AND m.practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!m) throw notFound("Email not found.");
  return m;
}

// Opening a message marks it read and returns its whole thread.
export async function getMessage(ctx, id) {
  await assertEnabled(ctx);
  const m = await loadMessage(ctx, id);
  if (!m.is_read) await exec(`UPDATE email_messages SET is_read = true WHERE id = :id`, { id });
  const thread = await select(
    `SELECT m.id, m.direction, m.status, m.from_address, m.from_name, m.to_addresses, m.cc_addresses, m.subject, m.body_html, m.body_text,
            m.error_message, coalesce(m.received_at, m.sent_at, m.created_at) AS at
       FROM email_messages m WHERE m.thread_id = :threadId AND m.practice_id = :practiceId AND m.folder <> 'trash'
      ORDER BY coalesce(m.received_at, m.sent_at, m.created_at)`,
    { threadId: m.thread_id, practiceId: ctx.practiceId },
  );
  return { ...m, is_read: true, thread };
}

const withSignature = (text, signature) => (signature ? `${text}\n\n--\n${signature}` : text);

// Queues one outbound email (the email.send job sends it).
async function queueOutbound(ctx, { account, settings, to, cc = [], bcc = [], subject, html, text, templateId = null, campaignId = null, leadId = null, patientId = null, threadId = null, inReplyTo = null }) {
  const contact = leadId || patientId ? { leadId, patientId } : await matchContact(ctx.practiceId, to[0]);
  const row = await one(
    `INSERT INTO email_messages (practice_id, account_id, direction, folder, status, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
                                 subject, body_html, body_text, template_id, campaign_id, lead_id, patient_id, in_reply_to, thread_id, created_by)
     VALUES (:practiceId, :accountId, 'outbound', 'sent', 'queued', :from, :fromName, :to::text[], :cc::text[], :bcc::text[],
             :subject, :html, :text, :templateId, :campaignId, :leadId, :patientId, :inReplyTo, coalesce(:threadId::uuid, gen_random_uuid()), :userId)
     RETURNING id`,
    {
      practiceId: ctx.practiceId,
      accountId: account.id,
      from: account.email_address,
      fromName: account.display_name || settings.default_from_name || null,
      to: pgArray(to),
      cc: pgArray(cc),
      bcc: pgArray(bcc),
      subject,
      html,
      text,
      templateId,
      campaignId,
      leadId: contact.leadId,
      patientId: contact.patientId,
      inReplyTo,
      threadId,
      userId: ctx.userId ?? null,
    },
  );
  await enqueue(QUEUES.EMAIL_SEND, { messageId: row.id }, { singletonKey: row.id });
  return row.id;
}

// Compose: free text, or a template filled for the recipient.
export async function sendEmail(ctx, input) {
  await assertEnabled(ctx);
  const { account, settings } = await sendingAccount(ctx, input.account_id);
  // Typed address: link (and personalise for) the matching lead or patient.
  const contact = input.lead_id || input.patient_id
    ? { leadId: input.lead_id ?? null, patientId: input.patient_id ?? null }
    : await matchContact(ctx.practiceId, input.to[0]);
  const values = await variablesFor(ctx.practiceId, { leadId: contact.leadId, patientId: contact.patientId, email: input.to[0] });
  let subject = input.subject;
  let text = input.body_text ?? "";
  let html = null;
  if (input.template_id) {
    const template = await getTemplate(ctx, input.template_id);
    const rendered = renderTemplate(template, values);
    subject = input.subject || rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } else {
    if (!subject?.trim() || !text.trim()) throw badRequest("Write a subject and a message, or pick a template.");
    subject = fill(subject, values);
    text = withSignature(fill(text, values), settings.signature);
    html = textToHtml(text);
  }
  const id = await queueOutbound(ctx, {
    account,
    settings,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject,
    html,
    text,
    templateId: input.template_id ?? null,
    leadId: contact.leadId,
    patientId: contact.patientId,
  });
  return loadMessage(ctx, id);
}

export async function replyTo(ctx, id, { body_text: body, reply_all: replyAll = false }) {
  await assertEnabled(ctx);
  const original = await loadMessage(ctx, id);
  const { account, settings } = await sendingAccount(ctx, original.account_id ?? null).catch(() => sendingAccount(ctx));
  const to = original.direction === "inbound" ? [original.from_address] : original.to_addresses;
  const cc = replyAll && original.direction === "inbound"
    ? [...original.to_addresses, ...original.cc_addresses].filter((a) => a.toLowerCase() !== account.email_address.toLowerCase())
    : [];
  const subject = /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`;
  const quoted = (original.body_text ?? "").split("\n").map((l) => `> ${l}`).join("\n");
  const text = `${withSignature(body, settings.signature)}\n\nOn ${new Date(original.received_at ?? original.sent_at ?? original.created_at).toLocaleString("en-IN")}, ${original.from_name || original.from_address} wrote:\n${quoted}`;
  const newId = await queueOutbound(ctx, {
    account,
    settings,
    to,
    cc,
    subject,
    html: textToHtml(text),
    text,
    leadId: original.lead_id,
    patientId: original.patient_id,
    threadId: original.thread_id,
    inReplyTo: original.provider_message_id,
  });
  return loadMessage(ctx, newId);
}

export async function moveMessage(ctx, id, { folder }) {
  const m = await loadMessage(ctx, id);
  const target = folder === "restore" ? (m.direction === "inbound" ? "inbox" : "sent") : folder;
  await exec(`UPDATE email_messages SET folder = :folder WHERE id = :id`, { id, folder: target });
  return loadMessage(ctx, id);
}

export async function markRead(ctx, id, { is_read: isRead }) {
  await loadMessage(ctx, id);
  await exec(`UPDATE email_messages SET is_read = :isRead WHERE id = :id`, { id, isRead });
  return loadMessage(ctx, id);
}

export async function retryMessage(ctx, id) {
  const m = await loadMessage(ctx, id);
  if (m.status !== "failed") throw badRequest("Only failed emails can be retried.");
  await exec(`UPDATE email_messages SET status = 'queued', error_message = NULL, folder = 'sent' WHERE id = :id`, { id });
  await enqueue(QUEUES.EMAIL_SEND, { messageId: id }, { singletonKey: `${id}:${Date.now()}` });
  return loadMessage(ctx, id);
}

// Deletes from trash for good; otherwise moves to trash.
export async function deleteMessage(ctx, id) {
  const m = await loadMessage(ctx, id);
  if (m.folder === "trash") await exec(`DELETE FROM email_messages WHERE id = :id`, { id });
  else await exec(`UPDATE email_messages SET folder = 'trash' WHERE id = :id`, { id });
}

// --- jobs ----------------------------------------------------------------------------

// email.send: sends one queued message. Failures are recorded on the row
// (and on its campaign recipient / automation run) rather than retried
// blindly — the user retries from the Failed folder.
export async function deliverMessage({ messageId }) {
  const m = await one(`SELECT * FROM email_messages WHERE id = :id`, { id: messageId });
  if (!m || m.status !== "queued") return;
  const account = m.account_id ? await one(`SELECT * FROM email_accounts WHERE id = :id`, { id: m.account_id }) : null;
  try {
    if (!account) throw new Error("The email account was removed.");
    if (account.status === "paused") throw new Error("The email account is paused.");
    const parent = m.in_reply_to
      ? await one(`SELECT provider_message_id, in_reply_to FROM email_messages WHERE practice_id = :p AND provider_message_id = :mid LIMIT 1`, {
          p: m.practice_id,
          mid: m.in_reply_to,
        })
      : null;
    const providerId = await sendFromAccount(account, {
      fromName: m.from_name,
      to: m.to_addresses,
      cc: m.cc_addresses,
      bcc: m.bcc_addresses,
      subject: m.subject,
      html: m.body_html,
      text: m.body_text ?? "",
      inReplyTo: m.in_reply_to,
      references: parent?.in_reply_to ? `${parent.in_reply_to} ${m.in_reply_to}` : m.in_reply_to,
    });
    await exec(`UPDATE email_messages SET status = 'sent', provider_message_id = :providerId, sent_at = now(), error_message = NULL WHERE id = :id`, {
      id: m.id,
      providerId,
    });
    await exec(`UPDATE email_campaign_recipients SET status = 'sent', sent_at = now(), error_message = NULL WHERE message_id = :id`, { id: m.id });
    await exec(`UPDATE email_automation_runs SET status = 'sent', error_message = NULL WHERE message_id = :id`, { id: m.id });
  } catch (error) {
    const message = error instanceof AppError ? error.message : friendlyError(error, "outgoing (SMTP) server").message;
    await exec(`UPDATE email_messages SET status = 'failed', error_message = left(:message, 1000) WHERE id = :id`, { id: m.id, message });
    await exec(`UPDATE email_campaign_recipients SET status = 'failed', error_message = left(:message, 1000) WHERE message_id = :id`, { id: m.id, message });
    await exec(`UPDATE email_automation_runs SET status = 'failed', error_message = left(:message, 1000) WHERE message_id = :id`, { id: m.id, message });
    if (account && /rejected the email or password|Couldn't reach/.test(message)) {
      await exec(`UPDATE email_accounts SET status = 'error', last_error = :message WHERE id = :id`, { id: account.id, message });
    }
  }
}

const addresses = (field) => (field?.value ?? []).map((a) => a.address).filter(Boolean);

// Pulls new mail from one account's IMAP inbox since the last seen UID.
export async function syncAccount(account) {
  if (!account.imap_host || !account.sync_inbound || account.status === "paused") return { fetched: 0 };
  let client;
  let fetched = 0;
  try {
    client = await imap.connect(imapOptions(account, passwordOf(account)));
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      const sameBox = account.imap_uid_validity && String(account.imap_uid_validity) === String(mailbox.uidValidity);
      const range = sameBox && account.imap_last_uid ? { uid: `${Number(account.imap_last_uid) + 1}:*` } : { since: new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000) };
      let lastUid = sameBox ? Number(account.imap_last_uid ?? 0) : 0;
      for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid && sameBox) continue;
        lastUid = Math.max(lastUid, msg.uid);
        if (fetched >= MAX_PER_SYNC) break;
        await storeInbound(account, await simpleParser(msg.source));
        fetched += 1;
      }
      await exec(
        `UPDATE email_accounts SET imap_uid_validity = :validity, imap_last_uid = :lastUid, last_synced_at = now(), last_error = NULL,
                status = CASE WHEN status = 'error' THEN 'connected' ELSE status END WHERE id = :id`,
        { id: account.id, validity: String(mailbox.uidValidity), lastUid: lastUid || null },
      );
    } finally {
      lock.release();
    }
  } catch (error) {
    const message = friendlyError(error, "incoming (IMAP) server").message;
    await exec(`UPDATE email_accounts SET status = 'error', last_error = :message WHERE id = :id`, { id: account.id, message });
    throw new AppError(400, message, { code: "EMAIL_SYNC_FAILED" });
  } finally {
    await client?.logout().catch(() => {});
  }
  return { fetched };
}

async function storeInbound(account, parsed) {
  const from = parsed.from?.value?.[0];
  if (!from?.address) return;
  // Our own sent copies (e.g. Gmail shows them in the inbox) aren't inbound.
  if (from.address.toLowerCase() === account.email_address.toLowerCase()) return;
  const messageId = parsed.messageId ?? null;
  const refs = [parsed.inReplyTo, ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])].filter(Boolean);
  const parent = refs.length
    ? await one(`SELECT thread_id, lead_id, patient_id FROM email_messages WHERE practice_id = :p AND provider_message_id IN (:refs) ORDER BY created_at LIMIT 1`, {
        p: account.practice_id,
        refs,
      })
    : null;
  const contact = parent?.lead_id || parent?.patient_id ? { leadId: parent.lead_id, patientId: parent.patient_id } : await matchContact(account.practice_id, from.address);
  await exec(
    `INSERT INTO email_messages (practice_id, account_id, direction, folder, status, from_address, from_name, to_addresses, cc_addresses,
                                 subject, body_html, body_text, lead_id, patient_id, provider_message_id, in_reply_to, thread_id, is_read, received_at)
     VALUES (:practiceId, :accountId, 'inbound', 'inbox', 'received', :from, :fromName, :to::text[], :cc::text[], :subject, :html, :text,
             :leadId, :patientId, :messageId, :inReplyTo, coalesce(:threadId::uuid, gen_random_uuid()), false, :receivedAt)
     ON CONFLICT DO NOTHING`,
    {
      practiceId: account.practice_id,
      accountId: account.id,
      from: from.address,
      fromName: from.name || null,
      to: pgArray(addresses(parsed.to)),
      cc: pgArray(addresses(parsed.cc)),
      subject: (parsed.subject ?? "(no subject)").slice(0, 998),
      html: typeof parsed.html === "string" ? parsed.html.replace(/<script[\s\S]*?<\/script>/gi, "") : null,
      text: parsed.text ?? null,
      leadId: contact.leadId,
      patientId: contact.patientId,
      messageId,
      inReplyTo: parsed.inReplyTo ?? null,
      threadId: parent?.thread_id ?? null,
      receivedAt: parsed.date ?? new Date(),
    },
  );
}

// email.inbound-sync: every account that syncs.
export async function syncAll() {
  const accounts = await select(`SELECT * FROM email_accounts WHERE sync_inbound AND imap_host IS NOT NULL AND status <> 'paused'`);
  for (const account of accounts) await syncAccount(account).catch(() => {});
}

// "Sync now" in the mailbox.
export async function syncNow(ctx, accountId = null) {
  await assertEnabled(ctx);
  const accounts = await select(
    `SELECT * FROM email_accounts WHERE practice_id = :practiceId AND imap_host IS NOT NULL AND sync_inbound AND status <> 'paused'
        AND (:accountId::uuid IS NULL OR id = :accountId)`,
    { practiceId: ctx.practiceId, accountId },
  );
  if (!accounts.length) throw badRequest("No account is set up to receive email (add IMAP settings to an account).");
  let fetched = 0;
  const errors = [];
  for (const a of accounts) {
    try {
      fetched += (await syncAccount(a)).fetched;
    } catch (error) {
      errors.push(`${a.email_address}: ${error.message}`);
    }
  }
  if (errors.length && !fetched) throw badRequest(errors.join(" "));
  return { fetched, errors };
}

export { queueOutbound };
