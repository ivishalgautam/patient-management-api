"use strict";
import config from "../../config/index.js";
import { formatName, sendTemplate } from "./wafly-client.js";

// Used only when a clinic has no contact_phone.
export const DEFAULT_CONTACT = "8882850066";

// kind -> { template, params(payload) }. Payload fields: patient_phone,
// patient_name, contact_phone, booked_day, booked_slot, service_name.
export const TEMPLATES = {
  booking_confirm: {
    template: () => config.waffly_template_booking_confirm,
    params: (p) => [formatName(p.patient_name), p.service_name ?? "Dental service", p.booked_slot],
  },
  reminder_24h: {
    template: () => config.waffly_template_24_hours_before_appointment,
    params: (p) => [formatName(p.patient_name), p.booked_day, p.booked_slot],
  },
  reminder_2h: {
    template: () => config.waffly_template_2_hrs_before_appointment,
    params: (p) => [formatName(p.patient_name), p.booked_slot],
  },
  follow_up_1h: {
    template: () => config.waffly_template_1_hr_after_appointment,
    params: (p) => [formatName(p.patient_name)],
  },
  review_request: {
    template: () => config.waffly_template_review_mesaage,
    params: (p) => [formatName(p.patient_name)],
  },
};

export async function sendWhatsApp(kind, payload) {
  const def = TEMPLATES[kind];
  if (!def) throw new Error(`Unknown WhatsApp template "${kind}"`);
  return sendTemplate({
    template: def.template(),
    phone: payload.patient_phone,
    params: [...def.params(payload), payload.contact_phone || DEFAULT_CONTACT],
  });
}
