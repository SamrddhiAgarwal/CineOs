import { Router } from "express";
import { randomUUID } from "node:crypto";
import { ASSET_TYPES } from "../models/Asset.js";
import {
  branchAsset,
  getAssetById,
  getAssetVersions,
  listAllAssets,
} from "../services/assetService.js";
import { findRelatedAssets } from "../services/contextService.js";
import { HttpError } from "../utils/httpError.js";

export function createAssetRouter(): Router {
  const router = Router();

  /** GET /api/assets?type=&genre=&projectId=&latestOnly=true */
  router.get("/", async (req, res) => {
    const { type, genre, projectId, latestOnly } = req.query as Record<string, string | undefined>;
    if (type && !ASSET_TYPES.includes(type as never)) {
      throw HttpError.badRequest(`Invalid type "${type}"`);
    }
    const assets = await listAllAssets({
      type: type as never,
      genre,
      projectId,
      latestOnly: latestOnly !== "false",
      limit: 200,
    });
    res.json(assets);
  });

  /** GET /api/assets/related?genre=&type=&excludeProjectId= */
  router.get("/related", async (req, res) => {
    const { genre = "", type = "character", excludeProjectId } = req.query as Record<string, string | undefined>;
    if (!ASSET_TYPES.includes(type as never)) throw HttpError.badRequest(`Invalid type "${type}"`);
    res.json(await findRelatedAssets(genre, type as never, excludeProjectId));
  });

  /** GET /api/assets/:id — single asset by MongoDB _id */
  router.get("/:id", async (req, res) => {
    const asset = await getAssetById(req.params["id"]!);
    if (!asset) throw HttpError.notFound(`Asset ${req.params["id"]} not found`);
    res.json(asset);
  });

  /** GET /api/assets/:id/versions — all versions of this asset's assetId+branchId */
  router.get("/:id/versions", async (req, res) => {
    const asset = await getAssetById(req.params["id"]!);
    if (!asset) throw HttpError.notFound(`Asset ${req.params["id"]} not found`);
    res.json(await getAssetVersions(asset.assetId, asset.branchId));
  });

  /** POST /api/assets/:id/branch — create a new branch starting from this version */
  router.post("/:id/branch", async (req, res) => {
    const asset = await getAssetById(req.params["id"]!);
    if (!asset) throw HttpError.notFound(`Asset ${req.params["id"]} not found`);
    const branchId = randomUUID();
    const branched = await branchAsset(req.params["id"]!, branchId);
    res.status(201).json(branched);
  });

  return router;
}
