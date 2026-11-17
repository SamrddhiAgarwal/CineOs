/**
 * CineOS BullMQ Worker — separate process entry point.
 *
 * Run alongside the API server: `npm run dev:worker` (dev) or `npm run worker` (prod).
 * Processes agent jobs from the `cineos:agents` queue with configurable concurrency.
 * On final failure: marks the agent as failed, skips its dependents, and completes the workflow.
 */
import { Worker } from "bullmq";
import { connectDatabase, disconnectDatabase } from "./db/connection.js";
import { getTransitiveDependents } from "./dag/dagEngine.js";
import { config } from "./config/env.js";
import { createLlmClient } from "./llm/index.js";
import { createRedisConnection } from "./queue/connection.js";
import { createAgentQueue, AGENT_QUEUE_NAME, type AgentJobData } from "./queue/queues.js";
import {
  markAgentFailed,
  markDependentsSkipped,
  processAgentJob,
} from "./workflow/agentRunner.js";
import { ProjectModel } from "./models/Project.js";
import { isWorkflowComplete } from "./dag/dagEngine.js";
import { FFMPEG_INSTALL_HINT, checkMediaTools } from "./media/ffmpeg.js";
import { processRenderJob } from "./media/renderProcessor.js";
import { cleanStaleTmp, ensureMediaDirs, MEDIA_ROOT } from "./media/storage.js";
import { RENDER_QUEUE_NAME, type RenderJobData } from "./queue/renderQueue.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const llm = createLlmClient(config.llm);
  if (llm.isMock) {
    logger.warn("Worker LLM: MOCK mode");
  } else {
    logger.info(`Worker LLM: ${llm.provider} (${llm.model})`);
  }

  await connectDatabase(config.mongoUri);
  logger.info("Worker connected to MongoDB");

  const redisConnection = createRedisConnection(config.redisUrl);
  const queue = createAgentQueue(redisConnection);

  const worker = new Worker<AgentJobData>(
    AGENT_QUEUE_NAME,
    async (job) => {
      await processAgentJob(job.data, llm, queue, job.attemptsMade);
    },
    {
      connection: redisConnection,
      concurrency: config.workerConcurrency,
    },
  );

  worker.on("error", (err) => {
    logger.error("Worker error", err);
  });

  // Final failure handler: runs only when all retry attempts are exhausted.
  worker.on("failed", async (job, error) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return; // will retry; skip

    const { projectId, agent } = job.data;
    const errorMsg = error.message;
    logger.error(`[worker] ${agent} agent failed permanently for project ${projectId}: ${errorMsg}`);

    try {
      await markAgentFailed(projectId, agent, errorMsg, job.attemptsMade);

      // Skip agents that transitively depend on this failed agent
      const dependents = getTransitiveDependents(agent);
      if (dependents.length > 0) {
        await markDependentsSkipped(projectId, dependents, `Skipped: ${agent} agent failed.`);
      }

      // Check if the workflow is now complete (all agents terminal)
      const updatedProject = await ProjectModel.findById(projectId).lean();
      if (updatedProject && isWorkflowComplete(updatedProject.agentRuns)) {
        await ProjectModel.updateOne(
          { _id: projectId },
          { $set: { status: "failed", generationCompletedAt: new Date(), lastError: errorMsg } },
        );
        logger.info(`[worker] workflow marked failed for project ${projectId}`);
      }
    } catch (dbErr) {
      logger.error(`[worker] could not record failure for ${agent} / ${projectId}`, dbErr);
    }
  });

  logger.info(
    `CineOS worker ready — queue "${AGENT_QUEUE_NAME}", concurrency ${config.workerConcurrency}`,
  );

  // ── FFmpeg render worker ──────────────────────────────────────────────────
  await ensureMediaDirs();
  const removedTmp = await cleanStaleTmp(60 * 60 * 1000);
  if (removedTmp > 0) logger.warn(`Removed ${removedTmp} stale render scratch dir(s)`);
  const media = await checkMediaTools();
  if (media.available) {
    logger.info(`Render worker: ${media.ffmpegVersion}; media storage ${MEDIA_ROOT}`);
  } else {
    // Render jobs will fail explicitly with this message; nothing is ever mock-rendered.
    const hint = media.error?.includes(FFMPEG_INSTALL_HINT) ? "" : ` ${FFMPEG_INSTALL_HINT}`;
    logger.error(`Render worker: FFmpeg unavailable: ${media.error}${hint}`);
  }

  const renderWorker = new Worker<RenderJobData>(RENDER_QUEUE_NAME, processRenderJob, {
    connection: redisConnection,
    concurrency: config.media.renderConcurrency,
    // A crashed worker's active render is re-run by the stalled-job check once its lock expires.
    lockDuration: 60_000,
    maxStalledCount: 2,
  });
  renderWorker.on("error", (err) => logger.error("Render worker error", err));
  logger.info(`CineOS render worker ready — queue "${RENDER_QUEUE_NAME}", concurrency ${config.media.renderConcurrency}`);

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, closing worker`);
    await renderWorker.close();
    await worker.close();
    await queue.close();
    await disconnectDatabase();
    await redisConnection.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(`Worker startup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
