import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { provenanceSchema } from "./provenance.js";
import type { Provenance } from "../domain/types.js";

export const ASSET_TYPES = ["plan", "story", "character", "screenplay", "scene"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface AssetAttrs {
  /** Stable UUID — the same across all versions of a logical asset on a given branch. */
  assetId: string;
  projectId: Types.ObjectId;
  projectTitle: string;
  projectGenre: string;
  type: AssetType;
  version: number;
  branchId: string;
  /** MongoDB _id of the previous version document on this branch. */
  parentVersionId: Types.ObjectId | null;
  /** Stable assetId(s) from other projects whose content was included as context. */
  sourceAssetIds: string[];
  /** Compact summary of the inputs used for this generation. */
  generationPrompt: string | null;
  content: object;
  tags: string[];
  provenance: Provenance;
  createdAt: Date;
}

const assetSchema = new Schema<AssetAttrs>(
  {
    assetId: { type: String, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    projectTitle: { type: String, required: true },
    projectGenre: { type: String, required: true },
    type: { type: String, required: true, enum: ASSET_TYPES, index: true },
    version: { type: Number, required: true, default: 1 },
    branchId: { type: String, required: true, default: "main" },
    parentVersionId: { type: Schema.Types.ObjectId, default: null },
    sourceAssetIds: [{ type: String }],
    generationPrompt: { type: String, default: null },
    content: { type: Schema.Types.Mixed, required: true },
    tags: [{ type: String }],
    provenance: { type: provenanceSchema, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

assetSchema.index({ assetId: 1, branchId: 1, version: 1 }, { unique: true });
assetSchema.index({ projectId: 1, type: 1, branchId: 1 });
assetSchema.index({ type: 1, projectGenre: 1, createdAt: -1 });

export const AssetModel = model<AssetAttrs>("Asset", assetSchema);
export type AssetDocument = HydratedDocument<AssetAttrs>;
