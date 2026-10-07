import axios from "axios";
import config from "../config/index.js";

// Used only when the clinic has no contact_phone set.
const DEFAULT_CONTACT = "8882850066";

const normalizePhone = (phone) => {
  return String(phone).trim().replace(/^\+/, "").replace(/\s+/g, "");
};

const formatName = (name) => {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const sendTemplate = async ({ phone, template, params, label }) => {
  try {
    const url = encodeURI(
      `https://apps.wafly.in/api/sendtemplate.php?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}&Contact=${normalizePhone(phone)}&Template=${template}&Param=${params.join(",")}`,
    );

    const { data } = await axios.get(url);

    console.log(`✅ ${label} sent:`, data);

    return data;
  } catch (error) {
    console.error(`❌ ${label} failed:`, error?.response?.data || error);
  }
};

export const send24HoursBeforeAppointment = (payload) =>
  sendTemplate({
    phone: payload.patient_phone,
    template: config.waffly_template_24_hours_before_appointment,
    label: "24 hour reminder",
    params: [
      formatName(payload.patient_name),
      payload.booked_day,
      payload.booked_slot,
      payload.contact_phone || DEFAULT_CONTACT,
    ],
  });

export const send2HoursBeforeAppointment = (payload) =>
  sendTemplate({
    phone: payload.patient_phone,
    template: config.waffly_template_2_hrs_before_appointment,
    label: "2 hour reminder",
    params: [
      formatName(payload.patient_name),
      payload.booked_slot,
      payload.contact_phone || DEFAULT_CONTACT,
    ],
  });

export const send1HourAfterAppointment = (payload) =>
  sendTemplate({
    phone: payload.patient_phone,
    template: config.waffly_template_1_hr_after_appointment,
    label: "1 hour follow-up",
    params: [formatName(payload.patient_name), payload.contact_phone || DEFAULT_CONTACT],
  });

export const sendReviewMessage = (payload) =>
  sendTemplate({
    phone: payload.patient_phone,
    template: config.waffly_template_review_mesaage,
    label: "review request",
    params: [formatName(payload.patient_name), payload.contact_phone || DEFAULT_CONTACT],
  });
