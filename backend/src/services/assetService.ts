import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AssetModel, type AssetDocument, type AssetType } from "../models/Asset.js";
import { ProjectModel } from "../models/Project.js";
import type { Provenance } from "../domain/types.js";

export interface SaveAssetOptions {
  projectId: string;
  type: AssetType;
  content: object;
  branchId?: string;
  sourceAssetIds?: string[];
  generationPrompt?: string;
  provenance: Provenance;
  tags?: string[];
  /** Extra filter fields to scope the latest-version lookup (e.g. scene number). */
  stableFilter?: Record<string, unknown>;
}

/**
 * Persist a new version of an asset. Never overwrites an existing version — always
 * creates a new document and links it to the previous version via parentVersionId.
 */
export async function saveAssetVersion(opts: SaveAssetOptions): Promise<AssetDocument> {
  const project = await ProjectModel.findById(opts.projectId).lean();
  if (!project) throw new Error(`Project ${opts.projectId} not found`);

  const branchId = opts.branchId ?? project.branchId ?? "main";

  // Find the latest existing version for this asset type + branch (+ optional stable sub-key)
  const latest = await AssetModel.findOne(
    { projectId: new mongoose.Types.ObjectId(opts.projectId), type: opts.type, branchId, ...(opts.stableFilter ?? {}) },
  ).sort({ version: -1 }).lean();

  const version = (latest?.version ?? 0) + 1;
  const assetId = latest?.assetId ?? randomUUID();

  return AssetModel.create({
    assetId,
    projectId: new mongoose.Types.ObjectId(opts.projectId),
    projectTitle: project.title,
    projectGenre: project.genre,
    type: opts.type,
    version,
    branchId,
    parentVersionId: latest?._id ?? null,
    sourceAssetIds: opts.sourceAssetIds ?? [],
    generationPrompt: opts.generationPrompt ?? null,
    content: opts.content as object,
    tags: opts.tags ?? [],
    provenance: opts.provenance,
  });
}

/**
 * Save each character as an individual asset so they can be reused independently.
 * Returns the array of created asset documents.
 */
export async function saveCharacterAssets(
  opts: Omit<SaveAssetOptions, "type" | "content"> & { characters: unknown[] },
): Promise<AssetDocument[]> {
  const project = await ProjectModel.findById(opts.projectId).lean();
  if (!project) throw new Error(`Project ${opts.projectId} not found`);
  const branchId = opts.branchId ?? project.branchId ?? "main";

  return Promise.all(
    opts.characters.map(async (char, idx) => {
      const content = char as Record<string, unknown>;

      // Each named character has a stable assetId per branch derived from project+name
      const existing = await AssetModel.findOne(
        {
          projectId: new mongoose.Types.ObjectId(opts.projectId),
          type: "character",
          branchId,
          "content.name": content["name"],
        },
      ).sort({ version: -1 }).lean();

      const version = (existing?.version ?? 0) + 1;
      const assetId = existing?.assetId ?? randomUUID();

      return AssetModel.create({
        assetId,
        projectId: new mongoose.Types.ObjectId(opts.projectId),
        projectTitle: project.title,
        projectGenre: project.genre,
        type: "character",
        version,
        branchId,
        parentVersionId: existing?._id ?? null,
        sourceAssetIds: opts.sourceAssetIds ?? [],
        generationPrompt: opts.generationPrompt ?? null,
        content: { ...content, order: idx } as object,
        tags: [content["role"] as string].filter(Boolean),
        provenance: opts.provenance,
      });
    }),
  );
}

/** List all assets across all projects, most recent first. */
export async function listAllAssets(filters: {
  type?: AssetType;
  genre?: string;
  projectId?: string;
  limit?: number;
  latestOnly?: boolean;
}) {
  const query: Record<string, unknown> = {};
  if (filters.type) query.type = filters.type;
  if (filters.genre) query.projectGenre = filters.genre;
  if (filters.projectId) query.projectId = new mongoose.Types.ObjectId(filters.projectId);

  if (filters.latestOnly !== false) {
    // Return only the latest version per assetId+branchId combination
    return AssetModel.aggregate([
      { $match: query },
      { $sort: { version: -1 } },
      { $group: { _id: { assetId: "$assetId", branchId: "$branchId" }, doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { createdAt: -1 } },
      { $limit: filters.limit ?? 100 },
    ]);
  }

  return AssetModel.find(query).sort({ createdAt: -1 }).limit(filters.limit ?? 100).lean();
}

/** Get all versions of a logical asset (same assetId + branchId), oldest first. */
export async function getAssetVersions(assetId: string, branchId = "main") {
  return AssetModel.find({ assetId, branchId }).sort({ version: 1 }).lean();
}

/** Get a single asset by its MongoDB _id. */
export async function getAssetById(id: string) {
  return AssetModel.findById(id).lean();
}

/**
 * Branch an asset: create v1 on a new branch, linking back to the source version.
 * Returns the new asset document.
 */
export async function branchAsset(
  sourceAssetDbId: string,
  newBranchId: string,
): Promise<AssetDocument> {
  const source = await AssetModel.findById(sourceAssetDbId).lean();
  if (!source) throw new Error(`Asset ${sourceAssetDbId} not found`);

  // The new branch starts with the same assetId but a fresh version count
  return AssetModel.create({
    assetId: source.assetId,
    projectId: new mongoose.Types.ObjectId(source.projectId.toString()),
    projectTitle: source.projectTitle,
    projectGenre: source.projectGenre,
    type: source.type,
    version: 1,
    branchId: newBranchId,
    parentVersionId: source._id,
    sourceAssetIds: source.sourceAssetIds,
    generationPrompt: source.generationPrompt,
    content: source.content,
    tags: source.tags,
    provenance: source.provenance,
  });
}
