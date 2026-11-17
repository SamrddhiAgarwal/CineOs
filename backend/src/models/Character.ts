import { Schema, model, type Types } from "mongoose";
import { CHARACTER_ROLES, type CharacterRole, type Provenance } from "../domain/types.js";
import { provenanceSchema } from "./provenance.js";

export interface CharacterRelationship {
  character: string;
  type: string;
  description: string;
}

export interface CharacterAttrs {
  project: Types.ObjectId;
  order: number;
  name: string;
  role: CharacterRole;
  age: string;
  description: string;
  personality: string[];
  motivation: string;
  backstory: string;
  arc: string;
  relationships: CharacterRelationship[];
  provenance: Provenance;
}

const relationshipSchema = new Schema<CharacterRelationship>(
  {
    character: { type: String, required: true },
    type: { type: String, required: true },
    description: { type: String, required: true },
  },
  { _id: false },
);

const characterSchema = new Schema<CharacterAttrs>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    order: { type: Number, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: CHARACTER_ROLES, required: true },
    age: { type: String, required: true },
    description: { type: String, required: true },
    personality: { type: [String], default: [] },
    motivation: { type: String, required: true },
    backstory: { type: String, required: true },
    arc: { type: String, required: true },
    relationships: { type: [relationshipSchema], default: [] },
    provenance: { type: provenanceSchema, required: true },
  },
  { timestamps: true },
);

characterSchema.index({ project: 1, order: 1 });

export const CharacterModel = model<CharacterAttrs>("Character", characterSchema);
