import crypto from "crypto";
import config from "../config/index.js";

// Patient login: username "ddss<number>". The password is random unless
// PATIENT_PASSWORD_MODE=legacy (first 4 letters of the name + last 4 digits
// of the mobile number, guessable — kept only for clients that rely on it).
export const credentialGenerator = (patientNumber, fullname, mobile_number) => {
  const username = `ddss${patientNumber}`;
  return { username, password: patientPassword(fullname, mobile_number) };
};

export const patientPassword = (fullname, mobile_number) =>
  config.patient_password_mode === "legacy"
    ? String(fullname.substring(0, 4)).toLowerCase() + String(mobile_number).slice(-4)
    : randomPassword();

// 10 chars, no ambiguous characters (0/O, 1/l/I).
export const randomPassword = (length = 10) => {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
};
