"use strict";
import crypto from "crypto";
import { resolvePath } from "../field-mapping.js";

// Accepts any JSON payload (website builders, Zapier, …). The unguessable
// token in the URL authenticates the sender. account_ref.paths optionally
// maps JSON paths to answer keys: { "$.contact.phone": "phone", ... };
// without paths, top-level keys are used as answers.
export function toNormalized(payload, integration) {
  const paths = integration.account_ref?.paths ?? {};
  let answers;
  if (Object.keys(paths).length) {
    answers = {};
    for (const [path, key] of Object.entries(paths)) {
      const value = resolvePath(payload, path);
      if (value !== undefined) answers[key] = value;
    }
  } else {
    answers = Object.fromEntries(
      Object.entries(payload ?? {}).filter(([, v]) => v === null || typeof v !== "object" || Array.isArray(v)),
    );
  }
  const idPath = integration.account_ref?.id_path;
  const providerLeadId =
    (idPath && resolvePath(payload, idPath)) ||
    payload?.id ||
    payload?.lead_id ||
    // No stable id: hash the payload so exact re-deliveries dedupe.
    crypto.createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
  return { providerLeadId: String(providerLeadId), answers, raw: payload };
}
