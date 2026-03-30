"use strict";

import axios from "axios";
import config from "../config/index.js";

export async function sendBookingConfirm({
  patient_phone,
  patient_name,
  service_name,
  booked_slot,
  contact_us_at = "8882850066",
}) {
  // if (process.env.NODE_ENV !== "production") return;
  const trimmedPhone = String(patient_phone)
    .trim()
    .replace(/^\+/, "")
    .replace(/\s+/g, "");
  const patientPhone = trimmedPhone.startsWith("+")
    ? trimmedPhone.slice(1)
    : trimmedPhone;

  const patientFullname = String(patient_name)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  let configOpt = {
    method: "get",
    maxBodyLength: Infinity,
    url: encodeURI(
      `https://apps.wafly.in/api/sendtemplate.php?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}&Contact=${patientPhone}&Template=${config.waffly_template_booking_confirm}&Param=${patientFullname},${service_name},${booked_slot},${contact_us_at}`,
    ),
    headers: {},
  };

  try {
    const { data } = await axios.request(configOpt);
    console.log("Waffly 'booking_confirm' notification response: ", data);
    console.log(data.ApiMessage.ErrorMessage.error);
    return data;
  } catch (error) {
    console.log("Error sending 'booking_confirm' notification: ", error);
  }
}

export async function send24HoursBeforeAppointment({
  patient_phone,
  patient_name,
  booked_day,
  booked_slot,
  contact_us_at = "8882850066",
}) {
  // if (process.env.NODE_ENV !== "production") return;

  const trimmedPhone = String(patient_phone)
    .trim()
    .replace(/^\+/, "")
    .replace(/\s+/g, "");
  const patientPhone = trimmedPhone.startsWith("+")
    ? trimmedPhone.slice(1)
    : trimmedPhone;

  const patientFullname = String(patient_name)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  let configOpt = {
    method: "get",
    maxBodyLength: Infinity,
    url: encodeURI(
      `https://apps.wafly.in/api/sendtemplate.php?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}&Contact=${patientPhone}&Template=${config.waffly_template_24_hrs_before_appointment}&Param=${patientFullname},${booked_day},${booked_slot},${contact_us_at}`,
    ),
    headers: {},
  };

  try {
    const { data } = await axios.request(configOpt);
    console.log(
      "Waffly '24_hours_before_appointment' notification response: ",
      data,
    );

    console.log(data.ApiMessage.ErrorMessage.error);
    return data;
  } catch (error) {
    console.log(
      "Error sending '24_hours_before_appointment' notification: ",
      error,
    );
  }
}

export async function send2HoursBeforeAppointment({
  patient_phone,
  patient_name,
  booked_slot,
  contact_us_at = "8882850066",
}) {
  // if (process.env.NODE_ENV !== "production") return;

  const trimmedPhone = String(patient_phone)
    .trim()
    .replace(/^\+/, "")
    .replace(/\s+/g, "");
  const patientPhone = trimmedPhone.startsWith("+")
    ? trimmedPhone.slice(1)
    : trimmedPhone;

  const patientFullname = String(patient_name)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  let configOpt = {
    method: "get",
    maxBodyLength: Infinity,
    url: encodeURI(
      `https://apps.wafly.in/api/sendtemplate.php?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}&Contact=${patientPhone}&Template=${config.waffly_template_2_hrs_before_appointment}&Param=${patientFullname},${booked_slot},${contact_us_at}`,
    ),
    headers: {},
  };

  try {
    const { data } = await axios.request(configOpt);
    console.log(
      "Waffly '2_hrs_before_appointment' notification response: ",
      data,
    );
    return data;
  } catch (error) {
    console.log(
      "Error sending '2_hrs_before_appointment' notification: ",
      error,
    );
  }
}

export async function send1HourAfterAppointment({
  patient_phone,
  patient_name,
  contact_us_at = "8882850066",
}) {
  // if (process.env.NODE_ENV !== "production") return;

  const trimmedPhone = String(patient_phone)
    .trim()
    .replace(/^\+/, "")
    .replace(/\s+/g, "");
  const patientPhone = trimmedPhone.startsWith("+")
    ? trimmedPhone.slice(1)
    : trimmedPhone;

  const patientFullname = String(patient_name)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  let configOpt = {
    method: "get",
    maxBodyLength: Infinity,
    url: encodeURI(
      `https://apps.wafly.in/api/sendtemplate.php?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}&Contact=${patientPhone}&Template=${config.waffly_template_1_hr_after_appointment}&Param=${patientFullname},${contact_us_at}`,
    ),
    headers: {},
  };

  try {
    const { data } = await axios.request(configOpt);
    console.log(
      "Waffly '1_hr_after_appointment' notification response: ",
      data,
    );
    console.log(error.ApiMessage.ErrorMessage.error);
    return data;
  } catch (error) {
    console.log("Error sending '1_hr_after_appointment' notification: ", error);
  }
}

export async function sendReviewMessage({
  patient_phone,
  patient_name,
  contact_us_at = "8882850066",
}) {
  // if (process.env.NODE_ENV !== "production") return;

  const trimmedPhone = String(patient_phone)
    .trim()
    .replace(/^\+/, "")
    .replace(/\s+/g, "");
  const patientPhone = trimmedPhone.startsWith("+")
    ? trimmedPhone.slice(1)
    : trimmedPhone;

  const patientFullname = String(patient_name)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  let configOpt = {
    method: "get",
    maxBodyLength: Infinity,
    url: encodeURI(
      `https://apps.wafly.in/api/sendtemplate.php?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}&Contact=${patientPhone}&Template=${config.waffly_template_review_mesaage}&Param=${patientFullname},${contact_us_at}`,
    ),
    headers: {},
  };

  try {
    const { data } = await axios.request(configOpt);
    console.log("Waffly 'review_mesaage' notification response: ", data);
    console.log(error.ApiMessage.ErrorMessage.error);
    return data;
  } catch (error) {
    console.log("Error sending 'review_mesaage' notification: ", error);
  }
}
