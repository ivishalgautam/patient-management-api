"use strict";

// Template helpers (ported from BW Task's WhatsApp controller).

// Turns stored template components + { header: [...], body: [...],
// header_image_url, header_document_url, header_video_url } into the
// "components" parameter list Meta expects when sending.
export function buildComponentsFromVariables(storedComponents = [], variables = {}) {
  return storedComponents
    .filter(
      (c) =>
        (typeof c.text === "string" && c.text.includes("{{")) ||
        (c.type === "HEADER" && ["IMAGE", "DOCUMENT", "VIDEO"].includes(c.format)),
    )
    .map((c) => {
      const type = c.type.toLowerCase();
      if (c.format === "IMAGE") return { type, parameters: [{ type: "image", image: { link: variables.header_image_url } }] };
      if (c.format === "VIDEO") return { type, parameters: [{ type: "video", video: { link: variables.header_video_url } }] };
      if (c.format === "DOCUMENT") {
        return {
          type,
          parameters: [
            {
              type: "document",
              document: {
                link: variables.header_document_url,
                ...(variables.header_document_filename ? { filename: variables.header_document_filename } : {}),
              },
            },
          ],
        };
      }
      return { type, parameters: (variables[type] || []).map((v) => ({ type: "text", text: String(v) })) };
    });
}

// The body text with {{n}} filled in, for the inbox preview.
export function renderTemplateBodyText(storedComponents = [], variables = {}) {
  const body = storedComponents.find((c) => c.type === "BODY");
  if (!body?.text) return null;
  let text = body.text;
  (variables.body || []).forEach((value, index) => {
    text = text.replaceAll(`{{${index + 1}}}`, value);
  });
  return text;
}

export function countBodyVariables(components = []) {
  const text = components.find((c) => c.type === "BODY")?.text || "";
  return new Set(text.match(/\{\{\s*\d+\s*\}\}/g) || []).size;
}

// Variables a template needs before it can be sent.
export function requiredVariables(components = []) {
  const header = components.find((c) => c.type === "HEADER");
  return {
    header: header?.format && header.format !== "TEXT" ? header.format.toLowerCase() : null,
    headerText: header?.format === "TEXT" ? new Set(header.text?.match(/\{\{\s*\d+\s*\}\}/g) || []).size : 0,
    body: countBodyVariables(components),
  };
}

// Readable text for an inbound message of any type.
export function extractMessageText(msg) {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "interactive":
      if (msg.interactive?.type === "button_reply") return msg.interactive.button_reply.title;
      if (msg.interactive?.type === "list_reply") {
        const r = msg.interactive.list_reply;
        return r.description ? `${r.title}\n${r.description}` : r.title;
      }
      return "[interactive message]";
    case "button":
      return msg.button?.text || "[button message]";
    case "image":
      return msg.image?.caption || "[image]";
    case "document":
      return msg.document?.caption || msg.document?.filename || "[document]";
    case "video":
      return msg.video?.caption || "[video]";
    case "audio":
      return "[voice message]";
    case "location":
      return msg.location?.name || msg.location?.address || "[location]";
    case "sticker":
      return "[sticker]";
    case "reaction":
      return msg.reaction?.emoji ? `Reacted ${msg.reaction.emoji}` : "[reaction]";
    default:
      return `[${msg.type} message]`;
  }
}

export const mediaOf = (msg) => {
  const m = msg[msg.type];
  return m?.id ? { media_id: m.id, media_type: m.mime_type ?? null, media_filename: m.filename ?? null } : {};
};
