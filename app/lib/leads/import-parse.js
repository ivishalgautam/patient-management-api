"use strict";
import axios from "axios";
import xlsx from "xlsx";
import config from "../../config/index.js";
import { badRequest } from "../app-error.js";
import { normalizeKey } from "../integrations/field-mapping.js";

// Parsing for lead imports: CSV/XLSX buffers and shared Google Sheets.
export const sheetHttp = axios.create({ timeout: 15000, maxRedirects: 5 });

// First sheet -> { headers, rows: [{ header: value }] }. CSV values stay
// text (no number parsing), so phone numbers keep their digits.
export function parseSpreadsheet(buffer, { csv = false } = {}) {
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: "buffer", raw: csv, cellDates: false, dense: true });
  } catch {
    throw badRequest("Couldn't read the file. Upload a CSV or Excel (.xlsx) file.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw badRequest("The file has no sheets.");
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  if (!matrix.length) throw badRequest("The file is empty.");

  // Unique, non-empty headers ("Column 3", "Phone (2)").
  const seen = new Map();
  const headers = matrix[0].map((h, i) => {
    let name = String(h ?? "").trim() || `Column ${i + 1}`;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count > 1) name = `${name} (${count})`;
    return name;
  });
  const rows = matrix
    .slice(1)
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, String(cells[i] ?? "").trim()])))
    .filter((row) => Object.values(row).some((v) => v !== ""));
  if (rows.length > config.integrations.import_max_rows) {
    throw badRequest(`The file has ${rows.length} rows; the limit is ${config.integrations.import_max_rows}.`);
  }
  return { headers, rows };
}

// Accepts a normal Sheets link and returns its CSV export URL. Only
// docs.google.com links are fetched (no arbitrary URLs from users).
export function sheetExportUrl(link) {
  let url;
  try {
    url = new URL(String(link).trim());
  } catch {
    throw badRequest("Paste the Google Sheet's link.");
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !match) {
    throw badRequest("That isn't a Google Sheets link (https://docs.google.com/spreadsheets/d/…).");
  }
  const gid = url.hash.match(/gid=(\d+)/)?.[1] ?? url.searchParams.get("gid");
  const out = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/export`);
  out.searchParams.set("format", "csv");
  if (gid && /^\d+$/.test(gid)) out.searchParams.set("gid", gid);
  return { url: out.toString(), sheetId: match[1] };
}

export async function fetchGoogleSheet(link) {
  const { url, sheetId } = sheetExportUrl(link);
  let res;
  try {
    res = await sheetHttp.get(url, {
      responseType: "arraybuffer",
      maxContentLength: config.integrations.import_sheet_max_bytes,
      validateStatus: () => true,
    });
  } catch (error) {
    throw badRequest(
      error.code === "ERR_BAD_RESPONSE" || /maxContentLength/.test(error.message)
        ? "The sheet is too large to import."
        : "Couldn't reach Google Sheets. Try again.",
    );
  }
  const type = String(res.headers?.["content-type"] ?? "");
  if (res.status === 404) throw badRequest("Sheet not found. Check the link.");
  // Private sheets answer with a sign-in page (HTML) or 401/403.
  if (res.status >= 400 || !/text\/csv|text\/plain|octet-stream/.test(type)) {
    throw badRequest('Google wouldn\'t share the sheet. Set sharing to "Anyone with the link can view" and try again.');
  }
  return { ...parseSpreadsheet(Buffer.from(res.data), { csv: true }), sourceName: `Google Sheet ${sheetId.slice(0, 8)}…` };
}

// Header -> mapping target guesses, using the same aliases as integrations.
const GUESSES = [
  [/^(full_?name|name|patient_?name|customer_?name|lead_?name|your_name)$/, "full_name"],
  [/^first_?name$/, "first_name"],
  [/^(last_?name|surname)$/, "last_name"],
  [/(phone|mobile|contact_?(no|number)|whatsapp|cell)/, "phone"],
  [/e_?mail/, "email"],
  [/^(notes?|message|comments?|remarks?|query)$/, "notes"],
];

export function suggestMapping(headers, fields = []) {
  const byKey = new Map(fields.flatMap((f) => [[normalizeKey(f.key), f.key], [normalizeKey(f.label), f.key]]));
  const used = new Set();
  return Object.fromEntries(
    headers.map((header) => {
      const key = normalizeKey(header);
      let target = GUESSES.find(([re]) => re.test(key))?.[1] ?? (byKey.has(key) ? `cf:${byKey.get(key)}` : "ignore");
      // One column per core target; later matches are left to the user.
      if (target !== "ignore" && target !== "notes" && used.has(target)) target = "ignore";
      used.add(target);
      return [header, target];
    }),
  );
}
