import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { GENRES } from "../domain/types.js";
import { HttpError } from "../utils/httpError.js";

export const createProjectSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    idea: z.string().trim().min(10, "Describe the idea in at least 10 characters").max(4000),
    genre: z.enum(GENRES),
    durationMinutes: z.number().int().min(1).max(240),
  })
  .strict();
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Validate and replace `req.body` with the parsed value. ZodErrors are turned into 400s by the error handler. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}

/** Return the `:id` route param after checking it is a valid MongoDB ObjectId. */
export function projectIdParam(params: Record<string, string | string[] | undefined>): string {
  const id = params.id;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    throw HttpError.badRequest("Invalid project id.");
  }
  return id;
}
