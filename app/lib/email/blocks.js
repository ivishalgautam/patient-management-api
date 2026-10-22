"use strict";
// Email templates: the drag-and-drop block list compiled to email-safe HTML
// and plain text (BW Task's block compiler, with text escaped and only
// http(s)/mailto/tel links allowed), and {{variable}} filling.
//
// Blocks: { id, type, ...props }
//   title     { text, align }          paragraph { text, align }
//   image     { src, alt, link, width } button    { text, url, color, align }
//   divider   {}                        spacer    { height }
//   social    { links: [{ platform, url }] }

export const VARIABLES = [
  { key: "first_name", label: "First name" },
  { key: "name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "clinic", label: "Clinic / practice name" },
  { key: "stage", label: "Lead stage" },
  { key: "pipeline", label: "Lead pipeline" },
];

const escapeHtml = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ALIGN = new Set(["left", "center", "right"]);
const align = (a, fallback = "left") => (ALIGN.has(a) ? a : fallback);
const color = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c ?? "") ? c : fallback);
// Keeps {{variables}} in links; refuses javascript: and other schemes.
const safeUrl = (u) => {
  const url = String(u ?? "").trim();
  return /^(https?:\/\/|mailto:|tel:|\{\{)/i.test(url) ? escapeHtml(url) : "#";
};
const text = (t) => escapeHtml(t).replace(/\r?\n/g, "<br />");
const cell = (inner) => `<tr><td style="padding:12px 24px;">${inner}</td></tr>`;
const FONT = "font-family:Arial,Helvetica,sans-serif;";

function renderBlock(b) {
  switch (b.type) {
    case "title":
      return cell(`<h1 style="margin:0;font-size:24px;line-height:1.3;text-align:${align(b.align)};${FONT}color:#111827;">${text(b.text)}</h1>`);
    case "paragraph":
      return cell(`<p style="margin:0;font-size:15px;line-height:1.6;text-align:${align(b.align)};${FONT}color:#374151;">${text(b.text)}</p>`);
    case "divider":
      return `<tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" /></td></tr>`;
    case "spacer": {
      const h = Math.min(Math.max(Number(b.height) || 24, 4), 120);
      return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;
    }
    case "image": {
      if (!b.src) return "";
      const width = Number(b.width) ? `width:${Math.min(Number(b.width), 600)}px;` : "";
      const img = `<img src="${safeUrl(b.src)}" alt="${escapeHtml(b.alt ?? "")}" style="max-width:100%;display:inline-block;border:0;${width}" />`;
      return cell(`<div style="text-align:${align(b.align, "center")};">${b.link ? `<a href="${safeUrl(b.link)}" target="_blank">${img}</a>` : img}</div>`);
    }
    case "button": {
      const a = align(b.align, "center");
      return cell(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${a === "center" ? "0 auto" : a === "right" ? "0 0 0 auto" : "0"};"><tr>` +
          `<td style="border-radius:8px;background:${color(b.color, "#0f766e")};">` +
          `<a href="${safeUrl(b.url)}" target="_blank" style="display:inline-block;padding:12px 28px;${FONT}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(b.text || "Click here")}</a>` +
          `</td></tr></table>`,
      );
    }
    case "social": {
      const links = (Array.isArray(b.links) ? b.links : []).filter((l) => l?.url);
      if (!links.length) return "";
      return cell(
        `<div style="text-align:center;">${links
          .map((l) => `<a href="${safeUrl(l.url)}" target="_blank" style="margin:0 8px;${FONT}font-size:13px;color:#0f766e;text-decoration:none;">${escapeHtml(l.platform || l.url)}</a>`)
          .join("")}</div>`,
      );
    }
    default:
      return "";
  }
}

function blockText(b) {
  switch (b.type) {
    case "title":
    case "paragraph":
      return String(b.text ?? "").trim();
    case "button":
      return b.url ? `${b.text || "Link"}: ${b.url}` : "";
    case "image":
      return b.link ?? "";
    case "social":
      return (b.links ?? []).filter((l) => l?.url).map((l) => `${l.platform || "Link"}: ${l.url}`).join("\n");
    case "divider":
      return "———";
    default:
      return "";
  }
}

export const wrapHtml = (inner) =>
  `<!doctype html><html><body style="margin:0;padding:24px 0;background:#f3f4f6;">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">` +
  `${inner}</table></body></html>`;

export const compileBlocksToHtml = (blocks = []) => wrapHtml((blocks ?? []).map(renderBlock).join(""));
export const compileBlocksToText = (blocks = []) => (blocks ?? []).map(blockText).filter(Boolean).join("\n\n").trim();

export function htmlToText(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function defaultBlocks() {
  return [
    { id: "b1", type: "title", text: "Hi {{first_name}},", align: "left" },
    { id: "b2", type: "paragraph", text: "Write your message here. Insert fields like {{name}} or {{clinic}} from the variable list.", align: "left" },
    { id: "b3", type: "button", text: "Book an appointment", url: "https://", color: "#0f766e", align: "center" },
  ];
}

// Fills {{variables}}. In HTML the values are escaped; unknown ones stay.
export function fill(template, values, { html = false } = {}) {
  return String(template ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key) => {
    const v = values[key];
    if (v === undefined || v === null) return all;
    return html ? escapeHtml(v) : String(v);
  });
}

// Plain text written by a person (compose box) to simple HTML.
export const textToHtml = (t = "") => wrapHtml(cell(`<div style="${FONT}font-size:15px;line-height:1.6;color:#111827;">${text(t)}</div>`));
