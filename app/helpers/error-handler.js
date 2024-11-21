// errorHandler.js

import { ZodError } from "zod";

// Custom error handler function
export const ErrorHandler = (error, request, reply) => {
  console.log({ error });
  // Check if the error is a Zod validation error
  if (error instanceof ZodError) {
    // Return a 400 Bad Request with the validation error details
    console.error(error);
    reply.code(400).send({
      status: false,
      error: "Bad Request",
      message: error.errors
        .map((err) => `${err.path.join(".")} - ${err.message}`)
        .join(", "),
    });
  } else if (error.validation) {
    // This handles Fastify's built-in validation errors (e.g., schema validation errors)
    console.error(error);
    reply.code(400).send({
      status: false,
      error: "Bad Request",
      message: error.message,
    });
  } else if (error.statusCode === 401) {
    // Handle Unauthorized errors
    console.error(error);
    reply.code(401).send({
      status: false,
      error: "Unauthorized",
      message: error.message || "Authentication failed.",
    });
  } else if (error.statusCode === 404) {
    // Handle Not Found errors
    console.error(error);
    reply.code(404).send({
      status: false,
      error: "Not Found",
      message: error.message || "Resource not found.",
    });
  } else if (error.statusCode === 429) {
    reply.code(429).send({
      status: false,
      message:
        error.message ||
        "You have exceeded the allowed number of requests. Please try again later.",
    });
  } else {
    // For any other errors, respond with 500 Internal Server Error
    console.error(error);
    reply.code(500).send({
      status: false,
      error: "Internal Server Error",
      message: error.message || "An unexpected error occurred.",
    });
  }
};
