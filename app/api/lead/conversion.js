"use strict";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import config from "../../config/index.js";
import table from "../../db/models.js";
import { select, one, exec, withTransaction } from "../../db/sql.js";
import { badRequest, conflict } from "../../lib/app-error.js";
import { credentialGenerator } from "../../helpers/credential-generator.js";
import { createBooking, notifyBookingConfirmed } from "../booking/service.js";
import { addActivity, loadLead, moveLead } from "./service.js";

const splitPhone = (raw) => {
  const parsed = parsePhoneNumberFromString(String(raw ?? ""), config.default_phone_region);
  if (!parsed?.isValid()) return null;
  return { country_code: parsed.countryCallingCode, mobile_number: parsed.nationalNumber };
};

// Same visibility rules as the rest of the Leads module.
const loadConvertible = (ctx, leadId, transaction) => loadLead(ctx, leadId, { transaction, forUpdate: true });

// Patients of this practice whose phone matches the lead's (to link
// instead of creating a duplicate patient).
export async function conversionCandidates(ctx, leadId) {
  const lead = await loadLead(ctx, leadId);
  const phone = splitPhone(lead.phone);
  if (!phone) return [];
  return select(
    `SELECT pt.id AS patient_id, u.id AS user_id, u.fullname, u.username, u.mobile_number
       FROM patients pt JOIN users u ON u.id = pt.user_id
      WHERE pt.practice_id = :p AND u.deleted_at IS NULL
        AND regexp_replace(u.mobile_number, '\\D', '', 'g') = :mobile
      LIMIT 10`,
    { p: ctx.practiceId, mobile: phone.mobile_number },
  );
}

/**
 * input: {
 *   link_patient_id?,                       // link an existing patient
 *   patient?: { fullname?, mobile_number?, country_code?, email?, gender? },
 *   clinic_id?,                             // default: the lead's clinic
 *   booking?: { date, slot },               // optional first appointment
 *   move_to_won?: true                      // move to the pipeline's won stage
 * }
 */
export async function convertLead(ctx, leadId, input) {
  let generated = null;
  let bookingResult = null;
  const result = await withTransaction(async (transaction) => {
    const lead = await loadConvertible(ctx, leadId, transaction);
    if (lead.converted_patient_id) throw conflict("This lead has already been converted.");

    const clinicId = input.clinic_id ?? lead.clinic_id;
    const clinic = clinicId
      ? await one(`SELECT * FROM clinics WHERE id = :c AND practice_id = :p`, { c: clinicId, p: ctx.practiceId }, { transaction })
      : await one(`SELECT * FROM clinics WHERE practice_id = :p ORDER BY created_at LIMIT 1`, { p: ctx.practiceId }, { transaction });
    if (!clinic) throw badRequest("Choose the clinic the patient belongs to.");

    let patientId;
    let userId;
    if (input.link_patient_id) {
      const existing = await one(
        `SELECT pt.id, pt.user_id FROM patients pt WHERE pt.id = :id AND pt.practice_id = :p`,
        { id: input.link_patient_id, p: ctx.practiceId },
        { transaction },
      );
      if (!existing) throw badRequest("Patient not found in this practice.");
      patientId = existing.id;
      userId = existing.user_id;
    } else {
      const phone = input.patient?.mobile_number
        ? { country_code: input.patient.country_code ?? "91", mobile_number: input.patient.mobile_number }
        : splitPhone(lead.phone);
      if (!phone) throw badRequest("A valid mobile number is needed to register the patient.");
      const fullname = input.patient?.fullname ?? lead.full_name;
      const patientNumber = await table.PatientSequenceModel.next({ transaction });
      generated = credentialGenerator(patientNumber, fullname, phone.mobile_number);
      const user = await table.UserModel.create(
        {
          body: {
            username: generated.username,
            password: generated.password,
            fullname,
            country_code: phone.country_code,
            mobile_number: phone.mobile_number,
            email: input.patient?.email ?? lead.email ?? "",
            gender: input.patient?.gender ?? "",
            role: "patient",
          },
        },
        { transaction },
      );
      const patient = await table.PatientModel.create(
        { body: { source: lead.source ?? "" } },
        user.id,
        { transaction, practiceId: ctx.practiceId },
      );
      patientId = patient.id;
      userId = user.id;
    }

    const mapped = await one(
      `SELECT 1 FROM clinic_patient_mappings WHERE clinic_id = :c AND patient_id = :p`,
      { c: clinic.id, p: patientId },
      { transaction },
    );
    if (!mapped) await table.ClinicPatientMapModel.create(patientId, clinic.id, { transaction });
    await exec(`UPDATE patients SET source_lead_id = coalesce(source_lead_id, :leadId) WHERE id = :patientId`, {
      leadId,
      patientId,
    }, { transaction });

    if (input.booking) {
      bookingResult = await createBooking(
        { clinicId: clinic.id, patientId, date: input.booking.date, slot: input.booking.slot },
        { user: { id: ctx.userId, role: "staff" }, transaction },
      );
    }

    if (input.move_to_won !== false) {
      const won = await one(
        `SELECT id FROM pipeline_stages WHERE pipeline_id = :pipelineId AND stage_type = 'won' AND archived_at IS NULL
          ORDER BY position LIMIT 1`,
        { pipelineId: lead.pipeline_id },
        { transaction },
      );
      if (won && won.id !== lead.stage_id) {
        await moveLead({ ...ctx, system: true }, leadId, { stage_id: won.id }, { transaction });
      }
    }
    await exec(
      `UPDATE leads SET status = 'converted', converted_patient_id = :patientId, converted_at = now(),
              converted_by = :userId, clinic_id = coalesce(clinic_id, :clinicId), updated_at = now()
        WHERE id = :leadId`,
      { leadId, patientId, userId: ctx.userId, clinicId: clinic.id },
      { transaction },
    );
    await addActivity(
      ctx.practiceId,
      leadId,
      {
        type: "conversion",
        body: input.link_patient_id ? "Linked to an existing patient" : "Registered as a new patient",
        metadata: {
          patient_id: patientId,
          clinic_id: clinic.id,
          ...(bookingResult ? { booking_id: bookingResult.booking.id } : {}),
        },
        created_by: ctx.userId,
      },
      { transaction },
    );
    return { patient_id: patientId, user_id: userId, clinic_id: clinic.id };
  });

  if (bookingResult) {
    notifyBookingConfirmed(bookingResult).catch(() => {});
  }
  return {
    ...result,
    ...(generated ? { username: generated.username, temporary_password: generated.password } : {}),
    ...(bookingResult ? { booking_id: bookingResult.booking.id } : {}),
  };
}
