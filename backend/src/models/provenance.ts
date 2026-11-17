import { Schema } from "mongoose";
import { AGENT_NAMES, LLM_PROVIDERS, type Provenance } from "../domain/types.js";

/** Embedded on every generated document so the API/UI can distinguish Gemini output from mock output. */
export const provenanceSchema = new Schema<Provenance>(
  {
    agent: { type: String, enum: AGENT_NAMES, required: true },
    provider: { type: String, enum: LLM_PROVIDERS, required: true },
    model: { type: String, default: null },
    isMock: { type: Boolean, required: true },
    generatedAt: { type: Date, required: true },
  },
  { _id: false },
);
