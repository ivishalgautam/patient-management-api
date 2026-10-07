"use strict";

// One CSV cell. Values starting with = + - @ (or tab/CR) get a leading
// apostrophe so spreadsheet apps don't evaluate them as formulas.
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows: arrays of values (first row = headings). CRLF line ends, with a BOM
// so Excel opens UTF-8 (names in Hindi etc.) correctly.
export const toCsv = (rows, { bom = false } = {}) =>
  (bom ? "\uFEFF" : "") + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
