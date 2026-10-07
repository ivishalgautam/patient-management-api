"use strict";
import { ZodError } from "zod";
import { cleanupFiles } from "../helpers/cleanup-files.js";

const REASONS = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
};

// Single error → response mapping. Shape is unchanged from before the
// revamp: { status: false, error, message }. 500s never echo internals.
export const ErrorHandler = (error, request, reply) => {
  if (Array.isArray(request.filePaths) && request.filePaths.length) {
    cleanupFiles(request.filePaths);
  }

  const send = (statusCode, message, extra = {}) =>
    reply.code(statusCode).send({
      status: false,
      error: REASONS[statusCode] ?? "Error",
      message,
      ...extra,
    });

  if (error instanceof ZodError || error?.name === "ZodError") {
    const issues = error.issues ?? error.errors ?? [];
    const message = issues.length
      ? issues.map((i) => `${i.path?.join(".") || "field"} - ${i.message}`).join(", ")
      : "Validation failed";
    return send(400, message);
  }

  if (error.name === "SequelizeUniqueConstraintError") {
    const fields = Object.keys(error.fields ?? {});
    const message = fields.length
      ? `${fields.join(", ")} already ${fields.length > 1 ? "exist" : "exists"}`
      : "A record with these details already exists";
    return send(409, message);
  }

  if (error.name === "SequelizeForeignKeyConstraintError") {
    return send(409, "This record is linked to other records.");
  }

  if (error.name === "SequelizeValidationError") {
    return send(400, error.errors?.map((e) => e.message).join(", ") || "Validation failed");
  }

  if (error.validation) {
    return send(400, error.message);
  }

  const status = error.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return send(status, error.message || REASONS[status] || "Request failed", {
      ...(error.code && error.name === "AppError" ? { code: error.code } : {}),
      ...(error.details ? { details: error.details } : {}),
    });
  }

  request.log.error({ err: error }, "unhandled error");
  return reply.code(500).send({
    status: false,
    error: "Internal Server Error",
    message: "Something went wrong. Please try again.",
    request_id: request.id,
  });
};

export default ErrorHandler;
