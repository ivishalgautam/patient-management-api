"use strict";
import crypto from "crypto";
import axios from "axios";
import config from "../../../config/index.js";

// Facebook / Instagram Lead Ads via the Graph API (design from the reference;
// differences: signed OAuth state, long-lived token exchange, token expiry
// tracking, webhook work done in a queued job).

// Separate client so tests can stub Graph calls without touching others.
export const graph = axios.create({ timeout: 15000 });

const base = () => `https://graph.facebook.com/${config.facebook.graph_version}`;
export const redirectUri = () => `${config.api_url}/integrations/facebook/oauth/callback`;

export const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "leads_retrieval",
  "business_management",
];

export const isConfigured = () => !!(config.facebook.app_id && config.facebook.app_secret);

// Graph errors carry useful text in error.response.data.error.
async function call(request) {
  try {
    const { data } = await graph.request(request);
    return data;
  } catch (error) {
    const fb = error.response?.data?.error;
    const wrapped = new Error(fb?.message ?? error.message);
    wrapped.code = fb?.code;
    wrapped.retryable = !fb || [1, 2, 4, 17, 32, 341, 613].includes(fb.code) || error.response?.status >= 500;
    throw wrapped;
  }
}

export function oauthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.facebook.app_id,
    redirect_uri: redirectUri(),
    scope: OAUTH_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/${config.facebook.graph_version}/dialog/oauth?${params}`;
}

// code -> short-lived user token -> long-lived user token -> pages. Page
// tokens obtained from a long-lived user token don't expire (Meta docs).
export async function exchangeCode(code) {
  const short = await call({
    method: "get",
    url: `${base()}/oauth/access_token`,
    params: {
      client_id: config.facebook.app_id,
      client_secret: config.facebook.app_secret,
      redirect_uri: redirectUri(),
      code,
    },
  });
  const long = await call({
    method: "get",
    url: `${base()}/oauth/access_token`,
    params: {
      grant_type: "fb_exchange_token",
      client_id: config.facebook.app_id,
      client_secret: config.facebook.app_secret,
      fb_exchange_token: short.access_token,
    },
  });
  const userToken = long.access_token;
  const pages = [];
  let url = `${base()}/me/accounts`;
  let params = { access_token: userToken, fields: "id,name,access_token", limit: 100 };
  while (url) {
    const page = await call({ method: "get", url, params });
    pages.push(...(page.data ?? []));
    url = page.paging?.next ?? null;
    params = undefined;
  }
  return {
    userToken,
    userTokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
    pages: pages.map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
  };
}

export async function listForms(pageId, pageToken) {
  const data = await call({
    method: "get",
    url: `${base()}/${pageId}/leadgen_forms`,
    params: { access_token: pageToken, fields: "id,name,status", limit: 100 },
  });
  return (data.data ?? []).map((f) => ({ id: f.id, name: f.name, status: f.status }));
}

export async function subscribePage(pageId, pageToken) {
  await call({
    method: "post",
    url: `${base()}/${pageId}/subscribed_apps`,
    params: { access_token: pageToken, subscribed_fields: "leadgen" },
  });
}

// { valid, expiresAt (null = never), scopes }
export async function inspectToken(token) {
  const data = await call({
    method: "get",
    url: `${base()}/debug_token`,
    params: { input_token: token, access_token: `${config.facebook.app_id}|${config.facebook.app_secret}` },
  });
  const d = data.data ?? {};
  return {
    valid: !!d.is_valid,
    expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
    scopes: d.scopes ?? [],
  };
}

// --- webhook ---------------------------------------------------------------

export function verifyChallenge(query) {
  if (
    query?.["hub.mode"] === "subscribe" &&
    config.facebook.webhook_verify_token &&
    query?.["hub.verify_token"] === config.facebook.webhook_verify_token
  ) {
    return query["hub.challenge"];
  }
  return null;
}

// X-Hub-Signature-256 = sha256 HMAC of the raw body with the app secret.
export function verifySignature(rawBody, header) {
  if (!config.facebook.app_secret || !rawBody || !header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", config.facebook.app_secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function extractNotifications(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const v = change.value ?? {};
      out.push({
        leadgenId: String(v.leadgen_id),
        pageId: String(v.page_id ?? entry.id),
        formId: v.form_id ? String(v.form_id) : null,
        createdTime: v.created_time ?? null,
      });
    }
  }
  return out;
}

// --- leads -----------------------------------------------------------------

export function toNormalized(lead, formName) {
  const answers = {};
  for (const { name, values } of lead.field_data ?? []) {
    answers[name] = Array.isArray(values) && values.length > 1 ? values : values?.[0] ?? null;
  }
  return {
    providerLeadId: String(lead.id),
    answers,
    submittedAt: lead.created_time ? new Date(lead.created_time).toISOString() : null,
    subSource: formName ? `Facebook: ${formName}` : null,
    raw: lead,
  };
}

export async function fetchLead(leadgenId, pageToken) {
  return call({
    method: "get",
    url: `${base()}/${leadgenId}`,
    params: { access_token: pageToken, fields: "id,created_time,field_data,form_id,ad_id" },
  });
}

// All leads on the form(s) created at/after `since` (client-side cutoff:
// the reference found Graph's time filter silently dropped leads).
export async function fetchSince(formIds, pageToken, since) {
  const leads = [];
  for (const formId of formIds) {
    let url = `${base()}/${formId}/leads`;
    let params = { access_token: pageToken, fields: "id,created_time,field_data,form_id", limit: 100 };
    while (url) {
      const page = await call({ method: "get", url, params });
      for (const lead of page.data ?? []) {
        const created = lead.created_time ? new Date(lead.created_time) : null;
        if (!created || created >= since) leads.push(lead);
      }
      url = page.paging?.next ?? null;
      params = undefined;
    }
  }
  return leads;
}
