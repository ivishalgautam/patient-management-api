"use strict";
import crypto from "crypto";
import config from "../../config/index.js";

// AES-256-GCM for integration secrets and raw payloads (ported from the
// reference app-store-encryption). Output: base64(iv | tag | ciphertext).
const ALGORITHM = "aes-256-gcm";

function key() {
  const raw = config.integrations.encryption_key;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes.");
  return buf;
}

export function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value ?? {}), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptJson(encoded) {
  if (!encoded) return null;
  const buf = Buffer.from(encoded, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8"));
}

export const generateWebhookToken = () => crypto.randomBytes(32).toString("base64url");

// Constant-time comparison for shared secrets (e.g. Google's google_key).
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
