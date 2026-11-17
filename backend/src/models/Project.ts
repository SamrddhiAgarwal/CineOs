import { Schema, model, type HydratedDocument } from "mongoose";
import {
  AGENT_NAMES,
  AGENT_RUN_STATUSES,
  GENRES,
  LLM_PROVIDERS,
  PROJECT_STATUSES,
  type AgentName,
  type AgentRunStatus,
  type Genre,
  type LlmProviderName,
  type ProjectStatus,
} from "../domain/types.js";

export interface AgentRun {
  agent: AgentName;
  status: AgentRunStatus;
  queuedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  provider: LlmProviderName | null;
  model: string | null;
  attempts: number;
}

export interface LlmInfo {
  provider: LlmProviderName;
  model: string | null;
  isMock: boolean;
}

export interface ProjectAttrs {
  title: string;
  idea: string;
  genre: Genre;
  durationMinutes: number;
  status: ProjectStatus;
  agentRuns: AgentRun[];
  llm: LlmInfo | null;
  generationStartedAt: Date | null;
  generationCompletedAt: Date | null;
  lastError: string | null;
  /** Branch this project lives on. "main" for originals; a UUID for branches. */
  branchId: string;
  /** Display label for this branch. null on the original. */
  branchName: string | null;
  /** MongoDB _id of the project this was branched from, if any. */
  parentProjectId: Schema.Types.ObjectId | null;
  /** Asset MongoDB _ids to include as reused context during generation. */
  reusedAssetIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const agentRunSchema = new Schema<AgentRun>(
  {
    agent: { type: String, enum: AGENT_NAMES, required: true },
    status: { type: String, enum: AGENT_RUN_STATUSES, required: true, default: "pending" },
    queuedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    error: { type: String, default: null },
    provider: { type: String, enum: [...LLM_PROVIDERS, null], default: null },
    model: { type: String, default: null },
    attempts: { type: Number, default: 0 },
  },
  { _id: false },
);

const llmInfoSchema = new Schema<LlmInfo>(
  {
    provider: { type: String, enum: LLM_PROVIDERS, required: true },
    model: { type: String, default: null },
    isMock: { type: Boolean, required: true },
  },
  { _id: false },
);

const projectSchema = new Schema<ProjectAttrs>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    idea: { type: String, required: true, trim: true, maxlength: 4000 },
    genre: { type: String, enum: GENRES, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 240 },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: "draft", index: true },
    agentRuns: { type: [agentRunSchema], default: [] },
    llm: { type: llmInfoSchema, default: null },
    generationStartedAt: { type: Date, default: null },
    generationCompletedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    branchId: { type: String, default: "main" },
    branchName: { type: String, default: null },
    parentProjectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    reusedAssetIds: [{ type: String }],
  },
  { timestamps: true },
);

projectSchema.index({ createdAt: -1 });

export const ProjectModel = model<ProjectAttrs>("Project", projectSchema);
export type ProjectDocument = HydratedDocument<ProjectAttrs>;

export function freshAgentRuns(): AgentRun[] {
  return AGENT_NAMES.map((agent) => ({
    agent,
    status: "pending",
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    provider: null,
    model: null,
    attempts: 0,
  }));
}
