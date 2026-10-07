"use strict";
import crypto from "crypto";
import axios from "axios";
import config from "../../config/index.js";

// Render token: proves the visitor loaded the form at least N seconds ago
// (bots post instantly) and that the post is for this form.
const sign = (payload) =>
  crypto.createHmac("sha256", config.form_token_secret).update(payload).digest("base64url");

export function issueRenderToken(formId, now = Date.now()) {
  const payload = `${formId}.${now}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Returns null when fine, otherwise the reason it looks automated.
export function checkRenderToken(token, formId, minSeconds, now = Date.now()) {
  if (!token || !token.includes(".")) return "missing token";
  const [body, signature] = token.split(".");
  let payload;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return "malformed token";
  }
  const expected = sign(payload);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return "bad signature";
  }
  const [tokenFormId, issuedAt] = payload.split(".");
  if (tokenFormId !== formId) return "token for another form";
  const age = now - Number(issuedAt);
  if (!(age >= minSeconds * 1000)) return "submitted too fast";
  if (age > MAX_AGE_MS) return "token expired";
  return null;
}

export const turnstileEnabled = () => !!(config.turnstile.site_key && config.turnstile.secret_key);

export async function verifyTurnstile(token, ip) {
  if (!token) return false;
  const { data } = await axios.post(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    new URLSearchParams({ secret: config.turnstile.secret_key, response: token, remoteip: ip ?? "" }),
    { timeout: 10000 },
  );
  return !!data?.success;
}

// Strips markup and control characters from visitor text.
export const sanitizeText = (value, max = 2000) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, "")
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

export const hashIp = (ip) =>
  ip ? crypto.createHmac("sha256", config.form_token_secret).update(ip).digest("hex") : null;
