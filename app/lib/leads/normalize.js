"use strict";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import config from "../../config/index.js";

// E.164 (e.g. +919876543210) or null when the number can't be parsed.
// Unparseable numbers are still stored as typed, just not used for dedupe.
export function normalizePhone(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const parsed = parsePhoneNumberFromString(String(raw), config.default_phone_region);
  return parsed?.isValid() ? parsed.number : null;
}

export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

// Masks for logs and integration events (PII-safe).
export const maskPhone = (raw) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : null;
};
export const maskEmail = (raw) => {
  const [user, domain] = String(raw ?? "").split("@");
  return domain ? `${user.slice(0, 1)}***@${domain}` : null;
};
