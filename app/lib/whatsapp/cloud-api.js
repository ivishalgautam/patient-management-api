"use strict";
import axios from "axios";
import crypto from "crypto";
import config from "../../config/index.js";

// WhatsApp Cloud API (Graph) client for one practice's number — the same
// calls as BW Task's lib/whatsapp, with the account passed in explicitly.
export const http = axios.create({ timeout: 20000 });
const base = () => `https://graph.facebook.com/${config.whatsapp_cloud.graph_version}`;

export class CloudApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = "CloudApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    // Rate limits and Meta outages are worth retrying; bad requests aren't.
    this.retryable = status >= 500 || [4, 80007, 130429, 131048, 131056].includes(code);
  }
}

async function call(account, { method = "POST", path, data, params }) {
  try {
    const res = await http.request({
      method,
      url: `${base()}/${path}`,
      data,
      params,
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    return res.data;
  } catch (error) {
    const meta = error.response?.data?.error;
    throw new CloudApiError(meta?.error_user_msg || meta?.message || error.message || "WhatsApp request failed", {
      code: meta?.code,
      status: error.response?.status ?? 0,
      details: meta ? { code: meta.code, subcode: meta.error_subcode, type: meta.type } : undefined,
    });
  }
}

export function client(account) {
  return {
    // Check the credentials: the number's display phone and verified name.
    getPhoneNumber: () =>
      call(account, {
        method: "GET",
        path: account.phone_number_id,
        params: { fields: "display_phone_number,verified_name,quality_rating" },
      }),
    sendMessage: (payload) =>
      call(account, { path: `${account.phone_number_id}/messages`, data: { messaging_product: "whatsapp", ...payload } }),
    createTemplate: ({ name, category, language, parameter_format, components }) =>
      call(account, {
        path: `${account.waba_id}/message_templates`,
        data: { name, category, language, parameter_format, components },
      }),
    listTemplates: async () => {
      const out = [];
      let after;
      do {
        const page = await call(account, {
          method: "GET",
          path: `${account.waba_id}/message_templates`,
          params: { fields: "id,name,category,language,status,components,rejected_reason,parameter_format", limit: 100, after },
        });
        out.push(...(page.data ?? []));
        after = page.paging?.next ? page.paging?.cursors?.after : undefined;
      } while (after && out.length < 2000);
      return out;
    },
    markRead: (wamid) =>
      call(account, {
        path: `${account.phone_number_id}/messages`,
        data: { messaging_product: "whatsapp", status: "read", message_id: wamid },
      }),
  };
}

// X-Hub-Signature-256 over the raw request body.
export function verifySignature(rawBody, header) {
  const secret = config.whatsapp_cloud.app_secret;
  if (!secret || !rawBody || !header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyChallenge(query = {}) {
  const token = config.whatsapp_cloud.webhook_verify_token;
  if (query["hub.mode"] === "subscribe" && token && query["hub.verify_token"] === token) {
    return String(query["hub.challenge"] ?? "");
  }
  return null;
}
