"use strict";
import { coerceValue } from "../leads/custom-values.js";

// Provider answer keys vary in punctuation ("_select_your_location",
// "area_/_locality", "Budget?"). Normalise both sides before matching
// (approach from the reference's facebook-custom-fields.js).
export const normalizeKey = (key) =>
  String(key ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const CORE = {
  full_name: ["full_name", "name", "your_name", "customer_name"],
  first_name: ["first_name"],
  last_name: ["last_name"],
  phone: ["phone_number", "phone", "mobile", "mobile_number", "contact_number", "whatsapp_number"],
  email: ["email", "email_address", "e_mail"],
  notes: ["message", "comments", "notes", "query"],
};
const coreFor = (key) => Object.entries(CORE).find(([, aliases]) => aliases.includes(key))?.[0];

// Minimal JSONPath ("$.a.b[0].c") for custom webhook mappings.
export function resolvePath(payload, path) {
  if (!payload || !path) return undefined;
  const segments = String(path)
    .trim()
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = payload;
  for (const s of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[s];
  }
  return current;
}

/**
 * Turns flat provider answers into createLead() input.
 *   answers:  { [providerKey]: value }
 *   mapping:  { [providerKey]: "full_name" | "phone" | "email" | "notes" | "cf:<key>" | "ignore" }
 *   fields:   the practice's custom fields
 * Unmapped answers that match a custom field key are used for it; anything
 * else is appended to notes so no answer is lost. Values that don't fit a
 * custom field's type become warnings, not failures.
 */
export function mapAnswers(answers, { mapping = {}, fields = [] } = {}) {
  const byKey = new Map(fields.map((f) => [normalizeKey(f.key), f]));
  const normalizedMapping = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [normalizeKey(k), v]));
  const lead = { custom_fields: {} };
  const extras = [];
  const warnings = [];
  let first = null;
  let last = null;

  for (const [rawKey, rawValue] of Object.entries(answers ?? {})) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const key = normalizeKey(rawKey);
    const target = normalizedMapping[key] ?? coreFor(key) ?? (byKey.has(key) ? `cf:${byKey.get(key).key}` : null);
    if (target === "ignore") continue;
    if (target === "first_name") first = rawValue;
    else if (target === "last_name") last = rawValue;
    else if (["full_name", "phone", "email"].includes(target)) lead[target] = String(rawValue).trim();
    else if (target === "notes") extras.push(String(rawValue));
    else if (target?.startsWith("cf:")) {
      const field = byKey.get(normalizeKey(target.slice(3)));
      if (!field) {
        warnings.push(`Mapped field "${target}" doesn't exist`);
        extras.push(`${rawKey}: ${rawValue}`);
        continue;
      }
      try {
        if (coerceValue(field, rawValue)) lead.custom_fields[field.key] = rawValue;
      } catch (error) {
        warnings.push(error.message);
        extras.push(`${rawKey}: ${rawValue}`);
      }
    } else {
      extras.push(`${rawKey}: ${Array.isArray(rawValue) ? rawValue.join(", ") : rawValue}`);
    }
  }
  if (!lead.full_name) lead.full_name = [first, last].filter(Boolean).join(" ").trim() || null;
  if (extras.length) lead.notes = extras.join("\n");
  return { lead, warnings };
}
