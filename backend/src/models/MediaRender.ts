import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const RENDER_KINDS = ["film", "trailer"] as const;
export type RenderKind = (typeof RENDER_KINDS)[number];

export const RENDER_STATUSES = ["queued", "rendering", "completed", "failed"] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

/** none: video only · score: soundtrack synthesised by FFmpeg · library: the project's own soundtrack file */
export const AUDIO_MODES = ["none", "score", "library"] as const;
export type AudioMode = (typeof AUDIO_MODES)[number];

export type VisualSource = "library-image" | "scene-card";

/** One scene of the cut, snapshotted at request time so history stays accurate after regeneration. */
export interface RenderInput {
  sceneNumber: number;
  /** MongoDB _id of the Scene document the cut was built from. */
  sceneId: Types.ObjectId;
  /** MongoDB _id of the versioned scene Asset (creative memory) at render time, if any. */
  sceneAssetId: Types.ObjectId | null;
  sceneAssetVersion: number | null;
  act: number;
  heading: string;
  timeOfDay: string;
  summary: string;
  characters: string[];
  caption: string;
  durationSeconds: number;
  visualSource: VisualSource | null;
  /** Path relative to MEDIA_ROOT of the still used for this scene. */
  visualPath: string | null;
  /** True when the visual already existed (e.g. created by an earlier render) and was reused. */
  visualReused: boolean;
  note: string | null;
}

export interface RenderAudio {
  requested: AudioMode;
  included: boolean;
  source: string | null;
  note: string | null;
}

export interface RenderOutput {
  /** Path relative to MEDIA_ROOT. */
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

/** Text for the title / end cards, snapshotted from the screenplay at request time. */
export interface RenderTitles {
  title: string;
  logline: string;
  genre: string;
}

export interface MediaRenderAttrs {
  projectId: Types.ObjectId;
  projectTitle: string;
  titles: RenderTitles;
  kind: RenderKind;
  /** Per project + kind counter: film v1, v2 … trailer v1, v2 … */
  version: number;
  status: RenderStatus;
  stage: string;
  progress: number;
  sceneNumbers: number[];
  targetSeconds: number;
  inputs: RenderInput[];
  audio: RenderAudio;
  /** Trailer: the completed film render whose scene visuals it reuses (if one existed). */
  sourceRenderId: Types.ObjectId | null;
  output: RenderOutput | null;
  error: string | null;
  attempts: number;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  renderSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const inputSchema = new Schema<RenderInput>(
  {
    sceneNumber: { type: Number, required: true },
    sceneId: { type: Schema.Types.ObjectId, ref: "Scene", required: true },
    sceneAssetId: { type: Schema.Types.ObjectId, ref: "Asset", default: null },
    sceneAssetVersion: { type: Number, default: null },
    act: { type: Number, default: 1 },
    heading: { type: String, required: true },
    timeOfDay: { type: String, default: "" },
    summary: { type: String, default: "" },
    characters: { type: [String], default: [] },
    caption: { type: String, default: "" },
    durationSeconds: { type: Number, required: true },
    visualSource: { type: String, enum: ["library-image", "scene-card", null], default: null },
    visualPath: { type: String, default: null },
    visualReused: { type: Boolean, default: false },
    note: { type: String, default: null },
  },
  { _id: false },
);

const audioSchema = new Schema<RenderAudio>(
  {
    requested: { type: String, enum: AUDIO_MODES, required: true },
    included: { type: Boolean, default: false },
    source: { type: String, default: null },
    note: { type: String, default: null },
  },
  { _id: false },
);

const outputSchema = new Schema<RenderOutput>(
  {
    path: { type: String, required: true },
    url: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    frameRate: { type: String, required: true },
    videoCodec: { type: String, required: true },
    videoProfile: { type: String, default: null },
    pixelFormat: { type: String, required: true },
    audioCodec: { type: String, default: null },
    hasAudio: { type: Boolean, required: true },
    fastStart: { type: Boolean, required: true },
  },
  { _id: false },
);

const mediaRenderSchema = new Schema<MediaRenderAttrs>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    projectTitle: { type: String, required: true },
    titles: {
      type: new Schema<RenderTitles>(
        { title: { type: String, required: true }, logline: { type: String, default: "" }, genre: { type: String, default: "" } },
        { _id: false },
      ),
      required: true,
    },
    kind: { type: String, enum: RENDER_KINDS, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: RENDER_STATUSES, required: true, default: "queued" },
    stage: { type: String, default: "queued" },
    progress: { type: Number, default: 0 },
    sceneNumbers: { type: [Number], default: [] },
    targetSeconds: { type: Number, required: true },
    inputs: { type: [inputSchema], default: [] },
    audio: { type: audioSchema, required: true },
    sourceRenderId: { type: Schema.Types.ObjectId, ref: "MediaRender", default: null },
    output: { type: outputSchema, default: null },
    error: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    queuedAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    renderSeconds: { type: Number, default: null },
  },
  { timestamps: true },
);

mediaRenderSchema.index({ projectId: 1, createdAt: -1 });
mediaRenderSchema.index({ projectId: 1, kind: 1, version: 1 }, { unique: true });
mediaRenderSchema.index({ status: 1 });

export const MediaRenderModel = model<MediaRenderAttrs>("MediaRender", mediaRenderSchema);
export type MediaRenderDocument = HydratedDocument<MediaRenderAttrs>;
