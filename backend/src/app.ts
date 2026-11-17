import fs from "node:fs";
import path from "node:path";
import type { Queue } from "bullmq";
import express, { type Express } from "express";
import type { Server as SocketServer } from "socket.io";
import { characterAgent } from "./agents/characterAgent.js";
import { producerAgent } from "./agents/producerAgent.js";
import { screenwriterAgent } from "./agents/screenwriterAgent.js";
import { storyAgent } from "./agents/storyAgent.js";
import { databaseState } from "./db/connection.js";
import { errorHandler, notFoundHandler } from "./http/errorHandler.js";
import type { LlmClient } from "./llm/index.js";
import { MEDIA_URL_PREFIX, PUBLIC_DIR } from "./media/storage.js";
import type { RenderJobData } from "./queue/renderQueue.js";
import { createAssetRouter } from "./routes/assetRoutes.js";
import { createProjectRouter } from "./routes/projectRoutes.js";
import { createRenderRouter } from "./routes/renderRoutes.js";
import { mediaToolStatus } from "./services/renderService.js";
import type { ProductionWorkflow } from "./workflow/productionWorkflow.js";

export interface AppDependencies {
  llm: LlmClient;
  workflow: ProductionWorkflow;
  renderQueue: Queue<RenderJobData>;
  io?: SocketServer;
  /** Serve the built dashboard from this directory when it exists (production). */
  frontendDistDir?: string;
}

const AGENTS = [producerAgent, storyAgent, characterAgent, screenwriterAgent];

export function createApp({ llm, workflow, renderQueue, io, frontendDistDir }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req, res) => {
    const database = databaseState();
    const media = await mediaToolStatus();
    res.status(database === "connected" ? 200 : 503).json({
      status: database === "connected" ? "ok" : "degraded",
      database,
      llm: { provider: llm.provider, model: llm.model, isMock: llm.isMock },
      media: { ffmpeg: media.available, ffmpegVersion: media.ffmpegVersion, ffprobeVersion: media.ffprobeVersion, error: media.error },
    });
  });

  // Finished renders and scene cards. express.static honours Range requests, so browsers can seek.
  app.use(
    MEDIA_URL_PREFIX,
    express.static(PUBLIC_DIR, { index: false, dotfiles: "deny", maxAge: "1h" }),
    (req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: `Media ${req.path} not found.` } }),
  );

  app.get("/api/agents", (_req, res) => {
    res.json(AGENTS.map(({ name, responsibility }) => ({ name, responsibility })));
  });

  app.use("/api/projects", createProjectRouter(workflow));
  app.use("/api/assets", createAssetRouter());
  app.use("/api", createRenderRouter(renderQueue, io));
  app.use("/api", notFoundHandler);

  // Production: serve the built React dashboard with SPA fallback.
  if (frontendDistDir && fs.existsSync(path.join(frontendDistDir, "index.html"))) {
    app.use(express.static(frontendDistDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(frontendDistDir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
