"use strict";
import { maskEmail, maskPhone } from "../leads/normalize.js";

// Masks personal data in provider payloads before they are logged or stored
// in plain form. Matches common field names in any nesting, including
// Facebook's [{ name, values }] and Google's [{ column_id, string_value }].
const PHONE = /phone|mobile|whatsapp|contact_?number|tel/i;
const EMAIL = /e-?mail/i;
const NAME = /full_?name|first_?name|last_?name|^name$|user_?name/i;
const FREE_TEXT = /message|notes?|comment|address|dob|birth/i;

const maskValue = (key, value) => {
  if (value === null || value === undefined || typeof value === "object") return value;
  if (PHONE.test(key)) return maskPhone(value);
  if (EMAIL.test(key)) return maskEmail(value);
  if (NAME.test(key)) return String(value).slice(0, 1) + "***";
  if (FREE_TEXT.test(key)) return "[redacted]";
  return value;
};

export function redact(payload) {
  if (Array.isArray(payload)) return payload.map(redact);
  if (!payload || typeof payload !== "object") return payload;

  // Name/value pair shapes: { name: "phone_number", values: ["+91..."] }
  const pairKey = payload.name ?? payload.column_id ?? payload.column_name ?? payload.key;
  if (typeof pairKey === "string") {
    const out = { ...payload };
    for (const valueKey of ["values", "value", "string_value"]) {
      if (valueKey in out) {
        out[valueKey] = Array.isArray(out[valueKey])
          ? out[valueKey].map((v) => maskValue(pairKey, v))
          : maskValue(pairKey, out[valueKey]);
      }
    }
    return out;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, typeof v === "object" ? redact(v) : maskValue(k, v)]),
  );
}
