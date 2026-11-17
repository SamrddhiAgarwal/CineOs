import { Schema, model, type Types } from "mongoose";
import type { Provenance } from "../domain/types.js";
import { provenanceSchema } from "./provenance.js";

export interface ScreenplayAttrs {
  project: Types.ObjectId;
  title: string;
  logline: string;
  sceneCount: number;
  estimatedRuntimeMinutes: number;
  provenance: Provenance;
}

const screenplaySchema = new Schema<ScreenplayAttrs>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    title: { type: String, required: true },
    logline: { type: String, required: true },
    sceneCount: { type: Number, required: true },
    estimatedRuntimeMinutes: { type: Number, required: true },
    provenance: { type: provenanceSchema, required: true },
  },
  { timestamps: true },
);

export const ScreenplayModel = model<ScreenplayAttrs>("Screenplay", screenplaySchema);
