"use strict";
import { select, exec } from "../../db/sql.js";
import { badRequest } from "../app-error.js";

// Converts an incoming value to the typed column it is stored in. Throws a
// 400 with the field label when the value doesn't fit the field type.
export function coerceValue(field, value) {
  const fail = (why) => {
    throw badRequest(`${field.label}: ${why}`);
  };
  if (value === undefined || value === null || value === "") return null;
  switch (field.field_type) {
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) fail("must be a number");
      return { value_number: n };
    }
    case "date": {
      const s = String(value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) fail("must be a date (YYYY-MM-DD)");
      return { value_date: s };
    }
    case "checkbox":
      return { value_bool: value === true || value === "true" || value === 1 || value === "1" || value === "on" };
    case "dropdown": {
      const s = String(value);
      if (!field.options.includes(s)) fail(`must be one of: ${field.options.join(", ")}`);
      return { value_text: s };
    }
    case "multi_select": {
      const list = (Array.isArray(value) ? value : String(value).split(","))
        .map((v) => String(v).trim())
        .filter(Boolean);
      const unknown = list.filter((v) => !field.options.includes(v));
      if (unknown.length) fail(`unknown option(s): ${unknown.join(", ")}`);
      return list.length ? { value_json: JSON.stringify([...new Set(list)]) } : null;
    }
    case "email": {
      const s = String(value).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail("must be an email address");
      return { value_text: s.toLowerCase() };
    }
    case "url": {
      const s = String(value).trim();
      try {
        const u = new URL(s);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        fail("must be a http(s) URL");
      }
      return { value_text: s };
    }
    case "phone": {
      const s = String(value).trim();
      if (!/^[+\d][\d\s()-]{5,}$/.test(s)) fail("must be a phone number");
      return { value_text: s };
    }
    default:
      return { value_text: String(value).slice(0, 5000) };
  }
}

export const readValue = (field, row) => {
  if (!row) return null;
  switch (field.field_type) {
    case "number":
      return row.value_number === null ? null : Number(row.value_number);
    case "date":
      return row.value_date;
    case "checkbox":
      return row.value_bool;
    case "multi_select":
      return row.value_json ?? [];
    default:
      return row.value_text;
  }
};

export async function practiceFields(practiceId, { transaction } = {}) {
  return select(
    `SELECT id, key, label, field_type, options, is_filterable FROM custom_fields
      WHERE practice_id = :practiceId AND entity = 'lead' AND archived_at IS NULL`,
    { practiceId },
    { transaction },
  );
}

// values: { [key]: value }. Unknown keys are rejected; null/"" clears.
export async function writeCustomValues(practiceId, leadId, values = {}, { transaction, fields } = {}) {
  const keys = Object.keys(values);
  if (!keys.length) return;
  const all = fields ?? (await practiceFields(practiceId, { transaction }));
  const byKey = new Map(all.map((f) => [f.key, f]));
  const unknown = keys.filter((k) => !byKey.has(k));
  if (unknown.length) throw badRequest(`Unknown custom field(s): ${unknown.join(", ")}`);

  for (const key of keys) {
    const field = byKey.get(key);
    const typed = coerceValue(field, values[key]);
    if (!typed) {
      await exec(
        `DELETE FROM lead_custom_field_values WHERE lead_id = :leadId AND custom_field_id = :fieldId`,
        { leadId, fieldId: field.id },
        { transaction },
      );
      continue;
    }
    await exec(
      `INSERT INTO lead_custom_field_values
         (lead_id, custom_field_id, value_text, value_number, value_date, value_bool, value_json)
       VALUES (:leadId, :fieldId, :text, :number, :date, :bool, :json::jsonb)
       ON CONFLICT (lead_id, custom_field_id) DO UPDATE SET
         value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
         value_date = EXCLUDED.value_date, value_bool = EXCLUDED.value_bool,
         value_json = EXCLUDED.value_json, updated_at = now()`,
      {
        leadId,
        fieldId: field.id,
        text: typed.value_text ?? null,
        number: typed.value_number ?? null,
        date: typed.value_date ?? null,
        bool: typed.value_bool ?? null,
        json: typed.value_json ?? null,
      },
      { transaction },
    );
  }
}

// { [leadId]: { [key]: value } }
export async function readCustomValues(practiceId, leadIds, { transaction } = {}) {
  if (!leadIds.length) return {};
  const fields = await practiceFields(practiceId, { transaction });
  const byId = new Map(fields.map((f) => [f.id, f]));
  const rows = await select(
    `SELECT * FROM lead_custom_field_values WHERE lead_id IN (:leadIds)`,
    { leadIds },
    { transaction },
  );
  const out = Object.fromEntries(leadIds.map((id) => [id, {}]));
  for (const row of rows) {
    const field = byId.get(row.custom_field_id);
    if (field) out[row.lead_id][field.key] = readValue(field, row);
  }
  return out;
}

// SQL condition + params for filtering leads by a filterable custom field.
export function customFilter(field, value, index) {
  const p = `cf${index}`;
  const base = `EXISTS (SELECT 1 FROM lead_custom_field_values v WHERE v.lead_id = l.id AND v.custom_field_id = :${p}_id AND`;
  const params = { [`${p}_id`]: field.id };
  switch (field.field_type) {
    case "number":
      return { sql: `${base} v.value_number = :${p}_v)`, params: { ...params, [`${p}_v`]: Number(value) } };
    case "date":
      return { sql: `${base} v.value_date = :${p}_v)`, params: { ...params, [`${p}_v`]: String(value) } };
    case "checkbox":
      return { sql: `${base} v.value_bool = :${p}_v)`, params: { ...params, [`${p}_v`]: value === "true" } };
    case "multi_select":
      return { sql: `${base} v.value_json @> :${p}_v::jsonb)`, params: { ...params, [`${p}_v`]: JSON.stringify([String(value)]) } };
    default:
      return { sql: `${base} lower(v.value_text) = lower(:${p}_v))`, params: { ...params, [`${p}_v`]: String(value) } };
  }
}
