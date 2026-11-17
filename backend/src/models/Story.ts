import { Schema, model, type Types } from "mongoose";
import type { Provenance } from "../domain/types.js";
import { provenanceSchema } from "./provenance.js";

export interface StoryAct {
  number: number;
  title: string;
  summary: string;
  keyEvents: string[];
}

export interface StoryAttrs {
  project: Types.ObjectId;
  title: string;
  logline: string;
  premise: string;
  synopsis: string;
  setting: string;
  structure: string;
  acts: StoryAct[];
  themes: string[];
  ending: string;
  provenance: Provenance;
}

const actSchema = new Schema<StoryAct>(
  {
    number: { type: Number, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    keyEvents: { type: [String], default: [] },
  },
  { _id: false },
);

const storySchema = new Schema<StoryAttrs>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    title: { type: String, required: true },
    logline: { type: String, required: true },
    premise: { type: String, required: true },
    synopsis: { type: String, required: true },
    setting: { type: String, required: true },
    structure: { type: String, required: true },
    acts: { type: [actSchema], default: [] },
    themes: { type: [String], default: [] },
    ending: { type: String, required: true },
    provenance: { type: provenanceSchema, required: true },
  },
  { timestamps: true },
);

export const StoryModel = model<StoryAttrs>("Story", storySchema);
