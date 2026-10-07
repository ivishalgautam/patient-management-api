"use strict";
import config from "../config/index.js";

// Never log credentials or patient data. Fastify does not log bodies; these
// paths cover headers and any object passed to request.log.* by our code.
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.new_password",
  "*.old_password",
  "*.token",
  "*.refresh_token",
  "*.access_token",
  "*.mobile_number",
  "*.phone",
  "*.email",
  "*.fullname",
];

export function loggerOptions() {
  if (config.isTest) return false;
  return {
    level: config.log_level,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...(config.isProduction
      ? {}
      : {
          transport: {
            target: "@mgcrea/pino-pretty-compact",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
              colorize: true,
            },
          },
        }),
  };
}
