"use strict";
import crypto from "crypto";
import config from "../../config/index.js";

// Signed OAuth `state`: proves the callback belongs to a connect flow that
// this practice's user started in the last 10 minutes (the reference had no
// state at all, leaving the callback open to forgery).
const TTL_MS = 10 * 60 * 1000;
const hmac = (body) =>
  crypto.createHmac("sha256", config.integrations.oauth_state_secret).update(body).digest("base64url");

export function signState(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), n: crypto.randomUUID() })).toString(
    "base64url",
  );
  return `${body}.${hmac(body)}`;
}

export function verifyState(state) {
  const [body, signature] = String(state ?? "").split(".");
  if (!body || !signature) throw new Error("Missing or malformed OAuth state.");
  const expected = hmac(body);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("OAuth state signature mismatch.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (Date.now() - payload.iat > TTL_MS) throw new Error("The connection attempt expired. Please try again.");
  return payload;
}
