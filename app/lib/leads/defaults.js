"use strict";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../db/postgres.js";

// Dental defaults every practice starts with (editable afterwards).
export const DEFAULT_PIPELINE = {
  name: "New Patient Enquiries",
  stages: [
    { name: "New Enquiry", color: "#3b82f6", probability: 10, stage_type: "open" },
    { name: "Contacted", color: "#6366f1", probability: 20, stage_type: "open", required_fields: ["phone"] },
    { name: "Consultation Booked", color: "#f59e0b", probability: 50, stage_type: "open", required_fields: ["phone"] },
    { name: "Treatment Plan Shared", color: "#a855f7", probability: 70, stage_type: "open" },
    { name: "Won - Treatment Started", color: "#16a34a", probability: 100, stage_type: "won" },
    { name: "Lost", color: "#dc2626", probability: 0, stage_type: "lost" },
  ],
};

export const LEAD_SOURCES = [
  "Walk-in",
  "Phone Call",
  "Website",
  "Facebook",
  "Instagram",
  "Google",
  "Referral",
  "WhatsApp",
];

export const DEFAULT_CUSTOM_FIELDS = [
  {
    key: "interest",
    label: "Interested in",
    field_type: "multi_select",
    is_filterable: true,
    options: [
      "Implants",
      "Braces / Aligners",
      "Cleaning / Scaling",
      "Root Canal",
      "Whitening",
      "Crowns / Bridges",
      "Dentures",
      "Extraction",
      "Kids Dentistry",
      "Consultation",
    ],
  },
  { key: "preferred_time", label: "Preferred time to call", field_type: "dropdown", options: ["Morning", "Afternoon", "Evening"] },
];

// Creates the default pipeline and custom fields for a practice that has
// none yet. Idempotent and safe to call on every request path that needs it.
export async function ensureLeadDefaults(practiceId, { transaction } = {}) {
  const run = async (t) => {
    const q = (sql, replacements) =>
      sequelize.query(sql, { replacements, transaction: t, type: QueryTypes.SELECT });
    // Serialise concurrent first calls for the same practice.
    await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext(:k))`, {
      replacements: { k: `lead-defaults:${practiceId}` },
      transaction: t,
    });
    const [existing] = await q(`SELECT 1 FROM pipelines WHERE practice_id = :practiceId LIMIT 1`, { practiceId });
    if (!existing) {
      const [pipeline] = await q(
        `INSERT INTO pipelines (practice_id, name, is_default) VALUES (:practiceId, :name, true) RETURNING id`,
        { practiceId, name: DEFAULT_PIPELINE.name },
      );
      for (const [position, stage] of DEFAULT_PIPELINE.stages.entries()) {
        await q(
          `INSERT INTO pipeline_stages (practice_id, pipeline_id, name, position, color, probability, stage_type, required_fields)
           VALUES (:practiceId, :pipelineId, :name, :position, :color, :probability, :stageType, :required::jsonb)
           RETURNING id`,
          {
            practiceId,
            pipelineId: pipeline.id,
            name: stage.name,
            position,
            color: stage.color,
            probability: stage.probability,
            stageType: stage.stage_type,
            required: JSON.stringify(stage.required_fields ?? []),
          },
        );
      }
    }
    for (const [position, field] of DEFAULT_CUSTOM_FIELDS.entries()) {
      await q(
        `INSERT INTO custom_fields (practice_id, key, label, field_type, options, is_filterable, position)
         VALUES (:practiceId, :key, :label, :type, :options::jsonb, :filterable, :position)
         ON CONFLICT (practice_id, entity, key) DO NOTHING RETURNING id`,
        {
          practiceId,
          key: field.key,
          label: field.label,
          type: field.field_type,
          options: JSON.stringify(field.options ?? []),
          filterable: !!field.is_filterable,
          position,
        },
      );
    }
  };
  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}
