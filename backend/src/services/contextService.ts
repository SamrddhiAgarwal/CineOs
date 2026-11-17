import { AssetModel, type AssetType } from "../models/Asset.js";

export interface ReusedContextItem {
  assetId: string;
  assetDbId: string;
  type: AssetType;
  projectTitle: string;
  label: string;
  /** Formatted text injected verbatim into the LLM generation prompt. */
  contextText: string;
}

/** Retrieve specific assets by their MongoDB _ids and format them for LLM injection. */
export async function getAssetContext(assetDbIds: string[]): Promise<ReusedContextItem[]> {
  if (assetDbIds.length === 0) return [];
  const assets = await AssetModel.find({ _id: { $in: assetDbIds } }).lean();
  return assets.map(formatForPrompt);
}

/**
 * Find relevant assets from other productions with the same genre, most recent first.
 * Used for suggestions in the UI — does not automatically inject anything.
 */
export async function findRelatedAssets(
  genre: string,
  type: AssetType,
  excludeProjectId?: string,
  limit = 10,
) {
  const query: Record<string, unknown> = { type, projectGenre: genre };
  if (excludeProjectId) query.projectId = { $ne: excludeProjectId };
  return AssetModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

function formatForPrompt(asset: { type: AssetType; content: unknown; projectTitle: string; assetId: string; _id: unknown }): ReusedContextItem {
  const c = asset.content as Record<string, unknown>;
  let contextText = "";

  switch (asset.type) {
    case "character":
      contextText = [
        `Name: ${c["name"]}`,
        `Role: ${c["role"]}`,
        `Age: ${c["age"]}`,
        `Description: ${c["description"]}`,
        `Personality: ${Array.isArray(c["personality"]) ? (c["personality"] as string[]).join(", ") : c["personality"]}`,
        `Motivation: ${c["motivation"]}`,
        `Backstory: ${c["backstory"]}`,
        `Arc: ${c["arc"]}`,
      ].join("\n");
      break;

    case "story":
      contextText = [
        `Title: ${c["title"]}`,
        `Logline: ${c["logline"]}`,
        `Premise: ${c["premise"]}`,
        `Synopsis: ${c["synopsis"]}`,
        `Setting: ${c["setting"]}`,
        `Themes: ${Array.isArray(c["themes"]) ? (c["themes"] as string[]).join(", ") : c["themes"]}`,
        `Ending: ${c["ending"]}`,
      ].join("\n");
      break;

    case "plan":
      contextText = [
        `Working title: ${c["workingTitle"]}`,
        `Logline: ${c["logline"]}`,
        `Tone: ${c["tone"]}`,
        `Target audience: ${c["targetAudience"]}`,
        `Themes: ${Array.isArray(c["themes"]) ? (c["themes"] as string[]).join(", ") : c["themes"]}`,
        `Visual style: ${c["visualStyle"]}`,
      ].join("\n");
      break;

    case "screenplay":
      contextText = [
        `Title: ${c["title"]}`,
        `Logline: ${c["logline"]}`,
        `Scene count: ${c["sceneCount"]}`,
        `Runtime: ${c["estimatedRuntimeMinutes"]} minutes`,
      ].join("\n");
      break;

    case "scene":
      contextText = [
        `Scene ${c["sceneNumber"]}: ${c["heading"]}`,
        `Location: ${c["location"]}, ${c["timeOfDay"]}`,
        `Summary: ${c["summary"]}`,
        `Purpose: ${c["purpose"]}`,
      ].join("\n");
      break;
  }

  return {
    assetId: asset.assetId,
    assetDbId: String(asset._id),
    type: asset.type,
    projectTitle: asset.projectTitle,
    label: `From "${asset.projectTitle}"`,
    contextText,
  };
}
