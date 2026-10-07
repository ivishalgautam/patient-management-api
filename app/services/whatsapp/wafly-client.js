"use strict";
import axios from "axios";
import config from "../../config/index.js";

const ENDPOINT = "https://apps.wafly.in/api/sendtemplate.php";

export const normalizePhone = (phone) =>
  String(phone ?? "").trim().replace(/^\+/, "").replace(/\s+/g, "");

export const formatName = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Sends one Wafly WhatsApp template. Throws on transport errors so the job
// queue retries; never logs the URL (it carries the API key).
export async function sendTemplate({ template, phone, params }) {
  if (!template) throw new Error("WhatsApp template is not configured.");
  const url = encodeURI(
    `${ENDPOINT}?LicenseNumber=${config.waffly_license}&APIKey=${config.waffly_api_key}` +
      `&Contact=${normalizePhone(phone)}&Template=${template}&Param=${params.join(",")}`,
  );
  const { data } = await axios.request({ method: "get", url, timeout: 15000 });
  return data;
}
