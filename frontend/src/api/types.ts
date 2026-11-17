/** JSON shapes returned by the CineOS API (mirrors backend models). */

export const GENRES = [
  "action",
  "adventure",
  "animation",
  "comedy",
  "crime",
  "documentary",
  "drama",
  "fantasy",
  "horror",
  "mystery",
  "romance",
  "sci-fi",
  "thriller",
  "western",
] as const;
export type Genre = (typeof GENRES)[number];

export type ProjectStatus = "draft" | "generating" | "completed" | "failed";
export type AgentName = "producer" | "story" | "character" | "screenwriter";
export type AgentRunStatus = "pending" | "queued" | "running" | "completed" | "failed" | "skipped";

export type LlmProviderName = "gemini" | "mock";

export interface LlmInfo {
  provider: LlmProviderName;
  model: string | null;
  isMock: boolean;
}

export interface Provenance extends LlmInfo {
  agent: AgentName;
  generatedAt: string;
}

export interface AgentRun {
  agent: AgentName;
  status: AgentRunStatus;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  provider: LlmProviderName | null;
  model: string | null;
  attempts: number;
}

/** Socket.IO server-to-client events. */
export interface WorkflowSocketEvents {
  "workflow:created": { projectId: string };
  "agent:started": { projectId: string; agent: AgentName };
  "agent:completed": { projectId: string; agent: AgentName };
  "agent:failed": { projectId: string; agent: AgentName; error: string };
  "job:retrying": { projectId: string; agent: AgentName; attempt: number; maxAttempts: number };
  "workflow:completed": { projectId: string; status: "completed" | "failed" };
}

export interface Project {
  id: string;
  title: string;
  idea: string;
  genre: Genre;
  durationMinutes: number;
  status: ProjectStatus;
  agentRuns: AgentRun[];
  llm: LlmInfo | null;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatusResponse = Pick<
  Project,
  "status" | "agentRuns" | "llm" | "generationStartedAt" | "generationCompletedAt" | "lastError"
> & { projectId: string };

export interface CreateProjectInput {
  title: string;
  idea: string;
  genre: Genre;
  durationMinutes: number;
}

export interface ProductionPlan {
  id: string;
  workingTitle: string;
  logline: string;
  tone: string;
  targetAudience: string;
  visualStyle: string;
  themes: string[];
  targetSceneCount: number;
  creativeTasks: { agent: Exclude<AgentName, "producer">; title: string; brief: string; deliverables: string[] }[];
  productionNotes: string[];
  provenance: Provenance;
}

export interface Story {
  id: string;
  title: string;
  logline: string;
  premise: string;
  synopsis: string;
  setting: string;
  structure: string;
  acts: { number: number; title: string; summary: string; keyEvents: string[] }[];
  themes: string[];
  ending: string;
  provenance: Provenance;
}

export interface Character {
  id: string;
  order: number;
  name: string;
  role: "protagonist" | "antagonist" | "supporting" | "minor";
  age: string;
  description: string;
  personality: string[];
  motivation: string;
  backstory: string;
  arc: string;
  relationships: { character: string; type: string; description: string }[];
  provenance: Provenance;
}

export interface Scene {
  id: string;
  sceneNumber: number;
  act: number;
  heading: string;
  location: string;
  timeOfDay: string;
  summary: string;
  purpose: string;
  characters: string[];
  action: string;
  dialogue: { character: string; parenthetical: string; line: string }[];
  estimatedDurationMinutes: number;
  provenance: Provenance;
}

export interface Screenplay {
  id: string;
  title: string;
  logline: string;
  sceneCount: number;
  estimatedRuntimeMinutes: number;
  provenance: Provenance;
  scenes: Scene[];
}

export interface Health {
  status: "ok" | "degraded";
  database: string;
  llm: LlmInfo;
  media: { ffmpeg: boolean; ffmpegVersion: string | null; ffprobeVersion: string | null; error: string | null };
}

export type RenderKind = "film" | "trailer";
export type RenderStatus = "queued" | "rendering" | "completed" | "failed";
export type AudioMode = "none" | "score" | "library";

export interface RenderInput {
  sceneNumber: number;
  sceneId: string;
  sceneAssetId: string | null;
  sceneAssetVersion: number | null;
  act: number;
  heading: string;
  caption: string;
  durationSeconds: number;
  visualSource: "library-image" | "scene-card" | null;
  visualPath: string | null;
  visualReused: boolean;
  note: string | null;
}

export interface RenderOutput {
  path: string;
  url: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: string;
  videoCodec: string;
  videoProfile: string | null;
  pixelFormat: string;
  audioCodec: string | null;
  hasAudio: boolean;
  fastStart: boolean;
}

export interface MediaRender {
  id: string;
  projectId: string;
  projectTitle: string;
  kind: RenderKind;
  version: number;
  status: RenderStatus;
  stage: string;
  progress: number;
  sceneNumbers: number[];
  targetSeconds: number;
  inputs: RenderInput[];
  audio: { requested: AudioMode; included: boolean; source: string | null; note: string | null };
  sourceRenderId: string | null;
  output: RenderOutput | null;
  error: string | null;
  attempts: number;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  renderSeconds: number | null;
  createdAt: string;
}

export interface CreateRenderInput {
  kind: RenderKind;
  sceneNumbers?: number[];
  targetSeconds?: number;
  audio: AudioMode;
}

/** Socket.IO render events (FFmpeg jobs relayed from the BullMQ render queue). */
export interface RenderSocketEvents {
  "render:queued": { projectId: string; render: MediaRender };
  "render:started": { projectId: string; render: MediaRender };
  "render:progress": { projectId: string; renderId: string; stage: string; progress: number };
  "render:completed": { projectId: string; render: MediaRender };
  "render:retrying": { projectId: string; render: MediaRender };
  "render:failed": { projectId: string; render: MediaRender };
}

export type AssetType = "plan" | "story" | "character" | "screenplay" | "scene";

export interface Asset {
  _id: string;
  assetId: string;
  projectId: string;
  projectTitle: string;
  projectGenre: string;
  type: AssetType;
  version: number;
  branchId: string;
  parentVersionId: string | null;
  sourceAssetIds: string[];
  generationPrompt: string | null;
  content: Record<string, unknown>;
  tags: string[];
  provenance: Provenance;
  createdAt: string;
}

export interface BranchedProject extends Project {
  branchId: string;
  branchName: string | null;
  parentProjectId: string | null;
  reusedAssetIds: string[];
}
