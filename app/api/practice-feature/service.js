"use strict";
import { select, one } from "../../db/sql.js";
import { badRequest, notFound } from "../../lib/app-error.js";
import { FEATURES } from "../../lib/integrations/registry.js";

// Add-on switches: one practice-wide row per feature, plus optional
// per-clinic rows that override it (see featureEnabled()).
export async function listFeatures(ctx) {
  const rows = await select(
    `SELECT f.feature_key, f.clinic_id, f.enabled, c.name AS clinic_name
       FROM practice_features f LEFT JOIN clinics c ON c.id = f.clinic_id
      WHERE f.practice_id = :practiceId`,
    { practiceId: ctx.practiceId },
  );
  return Object.values(FEATURES).map((feature) => {
    const own = rows.filter((r) => r.feature_key === feature.key);
    return {
      ...feature,
      enabled: !!own.find((r) => !r.clinic_id)?.enabled,
      clinics: own
        .filter((r) => r.clinic_id)
        .map((r) => ({ clinic_id: r.clinic_id, clinic_name: r.clinic_name, enabled: r.enabled })),
    };
  });
}

// clinic_id: null/absent = practice-wide. reset: true drops a clinic override.
export async function setFeature(ctx, key, { enabled, clinic_id: clinicId = null, reset = false }) {
  if (!FEATURES[key]) throw notFound("Unknown add-on.");
  if (clinicId) {
    const clinic = await one(`SELECT 1 FROM clinics WHERE id = :clinicId AND practice_id = :practiceId`, {
      clinicId,
      practiceId: ctx.practiceId,
    });
    if (!clinic) throw badRequest("Clinic not found in this practice.");
  }
  if (reset) {
    if (!clinicId) throw badRequest("Only a clinic override can be reset.");
    await one(
      `DELETE FROM practice_features WHERE practice_id = :practiceId AND clinic_id = :clinicId AND feature_key = :key RETURNING id`,
      { practiceId: ctx.practiceId, clinicId, key },
    );
  } else {
    await one(
      `INSERT INTO practice_features (practice_id, clinic_id, feature_key, enabled, created_by, updated_by)
       VALUES (:practiceId, :clinicId, :key, :enabled, :userId, :userId)
       ON CONFLICT (practice_id, coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid), feature_key)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING id`,
      { practiceId: ctx.practiceId, clinicId, key, enabled, userId: ctx.userId ?? null },
    );
  }
  return (await listFeatures(ctx)).find((f) => f.key === key);
}
