"use strict";
// Email accounts (SMTP to send, IMAP to receive) and module settings.
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { badRequest, conflict, notFound } from "../../lib/app-error.js";
import { encryptJson } from "../../lib/integrations/secrets.js";
import { passwordOf, verifyAccount } from "../../lib/email/transport.js";
import { getSettingsRow } from "./common.js";

// Common providers: most practices only type their address and password.
export const PROVIDERS = [
  { key: "gmail", label: "Gmail / Google Workspace", smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_secure: true, imap_host: "imap.gmail.com", imap_port: 993, note: "Turn on 2-step verification, then create an app password (Google account › Security › App passwords)." },
  { key: "outlook", label: "Outlook / Microsoft 365", smtp_host: "smtp.office365.com", smtp_port: 587, smtp_secure: false, imap_host: "outlook.office365.com", imap_port: 993, note: "Your Microsoft 365 admin may need to allow SMTP AUTH and IMAP for this mailbox." },
  { key: "zoho", label: "Zoho Mail (India)", smtp_host: "smtp.zoho.in", smtp_port: 465, smtp_secure: true, imap_host: "imap.zoho.in", imap_port: 993, note: "Enable IMAP in Zoho Mail settings; use an app-specific password if 2-factor login is on." },
  { key: "hostinger", label: "Hostinger", smtp_host: "smtp.hostinger.com", smtp_port: 465, smtp_secure: true, imap_host: "imap.hostinger.com", imap_port: 993, note: null },
  { key: "godaddy", label: "GoDaddy (Microsoft 365)", smtp_host: "smtp.office365.com", smtp_port: 587, smtp_secure: false, imap_host: "outlook.office365.com", imap_port: 993, note: null },
  { key: "yahoo", label: "Yahoo Mail", smtp_host: "smtp.mail.yahoo.com", smtp_port: 465, smtp_secure: true, imap_host: "imap.mail.yahoo.com", imap_port: 993, note: "Create an app password in Yahoo account security." },
  { key: "other", label: "Other", smtp_host: "", smtp_port: 587, smtp_secure: false, imap_host: "", imap_port: 993, note: "Ask your email provider for the SMTP and IMAP servers." },
];

const COLUMNS = `a.id, a.practice_id, a.provider, a.email_address, a.display_name, a.smtp_host, a.smtp_port, a.smtp_secure,
  a.imap_host, a.imap_port, a.imap_secure, a.auth_user, a.status, a.sync_inbound, a.last_synced_at, a.last_error, a.is_default,
  a.created_at, a.updated_at, (a.credentials_encrypted IS NOT NULL) AS has_password,
  (SELECT count(*)::int FROM email_messages m WHERE m.account_id = a.id AND m.direction = 'inbound' AND NOT m.is_read AND m.folder = 'inbox') AS unread`;

export function listAccounts(ctx) {
  return select(`SELECT ${COLUMNS} FROM email_accounts a WHERE a.practice_id = :practiceId ORDER BY a.is_default DESC, a.created_at`, {
    practiceId: ctx.practiceId,
  });
}

export async function getAccount(ctx, id) {
  const row = await one(`SELECT ${COLUMNS} FROM email_accounts a WHERE a.id = :id AND a.practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!row) throw notFound("Email account not found.");
  return row;
}

async function loadRaw(ctx, id) {
  const row = await one(`SELECT * FROM email_accounts WHERE id = :id AND practice_id = :practiceId`, { id, practiceId: ctx.practiceId });
  if (!row) throw notFound("Email account not found.");
  return row;
}

async function assertFreeAddress(ctx, email, exceptId = null) {
  const taken = await one(
    `SELECT 1 FROM email_accounts WHERE practice_id = :practiceId AND lower(email_address) = lower(:email) AND (:exceptId::uuid IS NULL OR id <> :exceptId)`,
    { practiceId: ctx.practiceId, email, exceptId },
  );
  if (taken) throw conflict(`${email} is already connected.`);
}

const draftOf = (input, existing = {}) => ({
  provider: input.provider ?? existing.provider ?? "other",
  email_address: input.email_address ?? existing.email_address,
  display_name: input.display_name !== undefined ? input.display_name || null : existing.display_name ?? null,
  smtp_host: input.smtp_host ?? existing.smtp_host,
  smtp_port: input.smtp_port ?? existing.smtp_port,
  smtp_secure: input.smtp_secure ?? existing.smtp_secure ?? false,
  imap_host: input.imap_host !== undefined ? input.imap_host || null : existing.imap_host ?? null,
  imap_port: input.imap_port !== undefined ? input.imap_port || null : existing.imap_port ?? null,
  imap_secure: input.imap_secure ?? existing.imap_secure ?? true,
  auth_user: input.auth_user !== undefined ? input.auth_user || null : existing.auth_user ?? null,
  sync_inbound: input.sync_inbound ?? existing.sync_inbound ?? true,
});

export async function createAccount(ctx, input) {
  await assertFreeAddress(ctx, input.email_address);
  const draft = draftOf(input);
  if (draft.imap_host && !draft.imap_port) throw badRequest("Enter the IMAP port (usually 993).");
  await verifyAccount(draft, input.password);
  const id = await withTransaction(async (transaction) => {
    const first = !(await one(`SELECT 1 FROM email_accounts WHERE practice_id = :practiceId`, { practiceId: ctx.practiceId }, { transaction }));
    const row = await one(
      `INSERT INTO email_accounts (practice_id, provider, email_address, display_name, smtp_host, smtp_port, smtp_secure,
                                   imap_host, imap_port, imap_secure, auth_user, credentials_encrypted, sync_inbound, is_default, created_by)
       VALUES (:practiceId, :provider, :email_address, :display_name, :smtp_host, :smtp_port, :smtp_secure,
               :imap_host, :imap_port, :imap_secure, :auth_user, :credentials, :sync_inbound, :isDefault, :userId) RETURNING id`,
      { practiceId: ctx.practiceId, ...draft, credentials: encryptJson({ password: input.password }), isDefault: first, userId: ctx.userId },
      { transaction },
    );
    return row.id;
  });
  return getAccount(ctx, id);
}

export async function updateAccount(ctx, id, input) {
  const existing = await loadRaw(ctx, id);
  if (input.email_address) await assertFreeAddress(ctx, input.email_address, id);
  const draft = draftOf(input, existing);
  const password = input.password || passwordOf(existing);
  const connectionChanged =
    input.password ||
    ["email_address", "smtp_host", "smtp_port", "smtp_secure", "imap_host", "imap_port", "imap_secure", "auth_user"].some(
      (k) => input[k] !== undefined && String(input[k] ?? "") !== String(existing[k] ?? ""),
    );
  if (connectionChanged) await verifyAccount(draft, password);
  const status = input.paused === true ? "paused" : input.paused === false || connectionChanged ? "connected" : existing.status;
  await exec(
    `UPDATE email_accounts SET provider = :provider, email_address = :email_address, display_name = :display_name,
            smtp_host = :smtp_host, smtp_port = :smtp_port, smtp_secure = :smtp_secure, imap_host = :imap_host, imap_port = :imap_port,
            imap_secure = :imap_secure, auth_user = :auth_user, sync_inbound = :sync_inbound, credentials_encrypted = :credentials,
            status = :status, last_error = CASE WHEN :connectionChanged THEN NULL ELSE last_error END,
            imap_uid_validity = CASE WHEN :connectionChanged THEN NULL ELSE imap_uid_validity END,
            imap_last_uid = CASE WHEN :connectionChanged THEN NULL ELSE imap_last_uid END, updated_at = now()
      WHERE id = :id`,
    { id, ...draft, credentials: encryptJson({ password }), status, connectionChanged: !!connectionChanged },
  );
  return getAccount(ctx, id);
}

export async function testAccount(ctx, id) {
  const account = await loadRaw(ctx, id);
  try {
    await verifyAccount(account, passwordOf(account));
  } catch (error) {
    await exec(`UPDATE email_accounts SET status = 'error', last_error = :error WHERE id = :id`, { id, error: error.message });
    throw error;
  }
  await exec(`UPDATE email_accounts SET status = CASE WHEN status = 'paused' THEN status ELSE 'connected' END, last_error = NULL WHERE id = :id`, { id });
  return getAccount(ctx, id);
}

export async function setDefault(ctx, id) {
  await loadRaw(ctx, id);
  await withTransaction(async (transaction) => {
    await exec(`UPDATE email_accounts SET is_default = false WHERE practice_id = :practiceId AND is_default`, { practiceId: ctx.practiceId }, { transaction });
    await exec(`UPDATE email_accounts SET is_default = true WHERE id = :id`, { id }, { transaction });
    await exec(
      `INSERT INTO email_settings (practice_id, default_account_id) VALUES (:practiceId, :id)
       ON CONFLICT (practice_id) DO UPDATE SET default_account_id = EXCLUDED.default_account_id, updated_at = now()`,
      { practiceId: ctx.practiceId, id },
      { transaction },
    );
  });
  return getAccount(ctx, id);
}

export async function deleteAccount(ctx, id) {
  const account = await loadRaw(ctx, id);
  await withTransaction(async (transaction) => {
    await exec(`DELETE FROM email_accounts WHERE id = :id`, { id }, { transaction });
    if (account.is_default) {
      // Promote the oldest remaining account.
      await exec(
        `UPDATE email_accounts SET is_default = true WHERE id = (SELECT id FROM email_accounts WHERE practice_id = :practiceId ORDER BY created_at LIMIT 1)`,
        { practiceId: ctx.practiceId },
        { transaction },
      );
    }
  });
}

// --- settings ----------------------------------------------------------------------

export async function getSettings(ctx) {
  return { settings: await getSettingsRow(ctx.practiceId), providers: PROVIDERS };
}

export async function saveSettings(ctx, input) {
  if (input.default_account_id) await loadRaw(ctx, input.default_account_id);
  await exec(
    `INSERT INTO email_settings (practice_id, is_enabled, default_from_name, default_account_id, signature, updated_by)
     VALUES (:practiceId, :isEnabled, :fromName, :accountId, :signature, :userId)
     ON CONFLICT (practice_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, default_from_name = EXCLUDED.default_from_name,
       default_account_id = EXCLUDED.default_account_id, signature = EXCLUDED.signature, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    {
      practiceId: ctx.practiceId,
      isEnabled: input.is_enabled,
      fromName: input.default_from_name || null,
      accountId: input.default_account_id ?? null,
      signature: input.signature || null,
      userId: ctx.userId,
    },
  );
  if (input.default_account_id) await setDefault(ctx, input.default_account_id);
  return getSettings(ctx);
}
