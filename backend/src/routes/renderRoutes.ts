import { Router } from "express";
import type { Queue } from "bullmq";
import type { Server as SocketServer } from "socket.io";
import { projectIdParam, validateBody } from "../http/validation.js";
import type { RenderJobData } from "../queue/renderQueue.js";
import {
  createRender,
  createRenderSchema,
  getRender,
  listRenders,
  renderFilePath,
  serializeRender,
  type CreateRenderInput,
} from "../services/renderService.js";

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "cineos";
}

/** Mounted at /api. */
export function createRenderRouter(queue: Queue<RenderJobData>, io?: SocketServer): Router {
  const router = Router();

  /** Request a film or trailer render: { kind, sceneNumbers?, targetSeconds?, audio } → 202 */
  router.post("/projects/:id/renders", validateBody(createRenderSchema), async (req, res) => {
    const render = await createRender(projectIdParam(req.params), req.body as CreateRenderInput, queue, io);
    res.status(202).location(`/api/renders/${render.id}`).json(serializeRender(render));
  });

  /** Media history for a production, newest first. */
  router.get("/projects/:id/renders", async (req, res) => {
    const renders = await listRenders(projectIdParam(req.params));
    res.json(renders.map(serializeRender));
  });

  router.get("/renders/:renderId", async (req, res) => {
    res.json(serializeRender(await getRender(String(req.params.renderId))));
  });

  /** Download the finished MP4 with a descriptive file name. */
  router.get("/renders/:renderId/download", async (req, res) => {
    const render = await getRender(String(req.params.renderId));
    const file = await renderFilePath(render);
    res.download(file, `${slug(render.projectTitle)}-${render.kind}-v${render.version}.mp4`);
  });

  return router;
}
