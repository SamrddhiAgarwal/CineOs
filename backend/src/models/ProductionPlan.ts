import { Schema, model, type Types } from "mongoose";
import { DELEGATE_AGENTS, type DelegateAgentName, type Provenance } from "../domain/types.js";
import { provenanceSchema } from "./provenance.js";

export interface CreativeTask {
  agent: DelegateAgentName;
  title: string;
  brief: string;
  deliverables: string[];
}

export interface ProductionPlanAttrs {
  project: Types.ObjectId;
  workingTitle: string;
  logline: string;
  tone: string;
  targetAudience: string;
  visualStyle: string;
  themes: string[];
  targetSceneCount: number;
  creativeTasks: CreativeTask[];
  productionNotes: string[];
  provenance: Provenance;
}

const creativeTaskSchema = new Schema<CreativeTask>(
  {
    agent: { type: String, enum: DELEGATE_AGENTS, required: true },
    title: { type: String, required: true },
    brief: { type: String, required: true },
    deliverables: { type: [String], default: [] },
  },
  { _id: false },
);

const productionPlanSchema = new Schema<ProductionPlanAttrs>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    workingTitle: { type: String, required: true },
    logline: { type: String, required: true },
    tone: { type: String, required: true },
    targetAudience: { type: String, required: true },
    visualStyle: { type: String, required: true },
    themes: { type: [String], default: [] },
    targetSceneCount: { type: Number, required: true, min: 1 },
    creativeTasks: { type: [creativeTaskSchema], default: [] },
    productionNotes: { type: [String], default: [] },
    provenance: { type: provenanceSchema, required: true },
  },
  { timestamps: true },
);

export const ProductionPlanModel = model<ProductionPlanAttrs>("ProductionPlan", productionPlanSchema);
