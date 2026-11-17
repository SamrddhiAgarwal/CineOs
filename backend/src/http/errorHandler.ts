import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found.`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const send = (status: number, body: ErrorBody) => res.status(status).json(body);

  if (err instanceof HttpError) {
    return send(err.status, { error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return send(400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }
  // express.json() parse failures
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
    return send(400, { error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } });
  }
  if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
    return send(400, { error: { code: "VALIDATION_ERROR", message: err.message } });
  }

  logger.error("Unhandled error", err);
  return send(500, { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
};
