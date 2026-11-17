import { Schema, model, type Types } from "mongoose";
import type { Provenance } from "../domain/types.js";
import { provenanceSchema } from "./provenance.js";

export interface DialogueLine {
  character: string;
  parenthetical: string;
  line: string;
}

export interface SceneAttrs {
  project: Types.ObjectId;
  screenplay: Types.ObjectId;
  sceneNumber: number;
  act: number;
  heading: string;
  location: string;
  timeOfDay: string;
  summary: string;
  purpose: string;
  characters: string[];
  action: string;
  dialogue: DialogueLine[];
  estimatedDurationMinutes: number;
  provenance: Provenance;
}

const dialogueSchema = new Schema<DialogueLine>(
  {
    character: { type: String, required: true },
    parenthetical: { type: String, default: "" },
    line: { type: String, required: true },
  },
  { _id: false },
);

const sceneSchema = new Schema<SceneAttrs>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    screenplay: { type: Schema.Types.ObjectId, ref: "Screenplay", required: true },
    sceneNumber: { type: Number, required: true },
    act: { type: Number, required: true },
    heading: { type: String, required: true },
    location: { type: String, required: true },
    timeOfDay: { type: String, required: true },
    summary: { type: String, required: true },
    purpose: { type: String, required: true },
    characters: { type: [String], default: [] },
    action: { type: String, required: true },
    dialogue: { type: [dialogueSchema], default: [] },
    estimatedDurationMinutes: { type: Number, required: true },
    provenance: { type: provenanceSchema, required: true },
  },
  { timestamps: true },
);

sceneSchema.index({ project: 1, sceneNumber: 1 }, { unique: true });

export const SceneModel = model<SceneAttrs>("Scene", sceneSchema);
