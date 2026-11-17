import { Router } from "express";
import { createProjectSchema, projectIdParam, validateBody, type CreateProjectInput } from "../http/validation.js";
import { listAllAssets } from "../services/assetService.js";
import * as projects from "../services/projectService.js";
import type { ProductionWorkflow } from "../workflow/productionWorkflow.js";

export function createProjectRouter(workflow: ProductionWorkflow): Router {
  const router = Router();

  router.post("/", validateBody(createProjectSchema), async (req, res) => {
    const project = await projects.createProject(req.body as CreateProjectInput);
    res.status(201).location(`/api/projects/${project.id}`).json(project);
  });

  router.get("/", async (_req, res) => {
    res.json(await projects.listProjects());
  });

  router.get("/:id", async (req, res) => {
    res.json(await projects.getProject(projectIdParam(req.params)));
  });

  /** Start (or restart) AI generation. Body may include reusedAssetIds for context-aware reuse. */
  router.post("/:id/generate", async (req, res) => {
    const id = projectIdParam(req.params);
    const reusedAssetIds: string[] = Array.isArray(req.body?.reusedAssetIds) ? req.body.reusedAssetIds : [];
    const project = await workflow.start(id, reusedAssetIds);
    res.status(202).json({
      projectId: project.id,
      status: project.status,
      llm: project.llm,
      statusUrl: `/api/projects/${project.id}/status`,
    });
  });

  /** Branch a production: creates a new project linked to this one. */
  router.post("/:id/branch", async (req, res) => {
    const id = projectIdParam(req.params);
    const branchName: string = req.body?.branchName ?? "";
    const branched = await projects.branchProject(id, branchName);
    res.status(201).json(branched);
  });

  /** List versioned assets for this project. */
  router.get("/:id/assets", async (req, res) => {
    const id = projectIdParam(req.params);
    await projects.getProject(id); // 404 guard
    res.json(await listAllAssets({ projectId: id, latestOnly: false }));
  });

  router.get("/:id/status", async (req, res) => {
    res.json(await projects.getProjectStatus(projectIdParam(req.params)));
  });

  router.get("/:id/plan", async (req, res) => {
    res.json(await projects.getProductionPlan(projectIdParam(req.params)));
  });

  router.get("/:id/story", async (req, res) => {
    res.json(await projects.getStory(projectIdParam(req.params)));
  });

  router.get("/:id/characters", async (req, res) => {
    res.json(await projects.getCharacters(projectIdParam(req.params)));
  });

  router.get("/:id/screenplay", async (req, res) => {
    res.json(await projects.getScreenplayWithScenes(projectIdParam(req.params)));
  });

  router.get("/:id/scenes", async (req, res) => {
    res.json(await projects.getScenes(projectIdParam(req.params)));
  });

  return router;
}
