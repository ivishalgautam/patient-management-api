"use strict";

// Throw from services/controllers; utils/error-handler.js turns it into
//   { status: false, error, message } with the given HTTP status.
export class AppError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = "Bad request.", opts) =>
  new AppError(400, message, opts);
export const unauthorized = (message = "Unauthorized.", opts) =>
  new AppError(401, message, opts);
export const forbidden = (
  message = "You don't have permission to perform this action.",
  opts,
) => new AppError(403, message, opts);
export const notFound = (message = "Not found.", opts) =>
  new AppError(404, message, opts);
export const conflict = (message = "Already exists.", opts) =>
  new AppError(409, message, opts);

export default AppError;
