import http from "node:http";
import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/connection.js";
import { createLlmClient } from "./llm/index.js";
import { createRedisConnection } from "./queue/connection.js";
import { createAgentQueue } from "./queue/queues.js";
import { createRenderQueue } from "./queue/renderQueue.js";
import { ensureMediaDirs, MEDIA_ROOT } from "./media/storage.js";
import { FFMPEG_INSTALL_HINT } from "./media/ffmpeg.js";
import { mediaToolStatus, recoverInterruptedRenders } from "./services/renderService.js";
import { createSocketServer, attachQueueEventsRelay, attachRenderEventsRelay } from "./sockets/socketServer.js";
import { logger } from "./utils/logger.js";
import { ProductionWorkflow } from "./workflow/productionWorkflow.js";

async function main(): Promise<void> {
  const llm = createLlmClient(config.llm);
  if (llm.isMock) {
    logger.warn("LLM: MOCK mode - no GEMINI_API_KEY configured (or LLM_MODE=mock). Output is deterministic and labelled MOCK.");
  } else {
    logger.info(`LLM: ${llm.provider} (model ${llm.model}, max output ${config.llm.maxTokens} tokens)`);
  }

  await connectDatabase(config.mongoUri);

  // Redis + BullMQ queue (API server uses it to enqueue jobs; worker processes them)
  const redisConn = createRedisConnection(config.redisUrl);
  const queue = createAgentQueue(redisConn);

  // Recover any in-flight workflows from before the last restart
  const recovered = await ProductionWorkflow.recoverInterrupted(queue);
  if (recovered > 0) logger.warn(`Re-enqueued ${recovered} job(s) for interrupted workflows.`);

  // FFmpeg render queue + local media storage
  await ensureMediaDirs();
  const renderQueue = createRenderQueue(redisConn);
  const media = await mediaToolStatus();
  if (media.available) {
    logger.info(`Media: ${media.ffmpegVersion}; storage ${MEDIA_ROOT}`);
  } else {
    const hint = media.error?.includes(FFMPEG_INSTALL_HINT) ? "" : ` ${FFMPEG_INSTALL_HINT}`;
    logger.error(`Media: FFmpeg unavailable, render requests will be rejected: ${media.error}${hint}`);
  }
  const recoveredRenders = await recoverInterruptedRenders(renderQueue);
  if (recoveredRenders > 0) logger.warn(`Re-queued ${recoveredRenders} interrupted render(s).`);

  // HTTP server + Socket.IO (must be created before attaching the app)
  const httpServer = http.createServer();
  const io = createSocketServer(httpServer);
  const cleanupQueueEvents = attachQueueEventsRelay(io, queue, config.redisUrl);
  const cleanupRenderEvents = attachRenderEventsRelay(io, config.redisUrl);

  const workflow = new ProductionWorkflow(queue, io);
  const app = createApp({ llm, workflow, renderQueue, io, frontendDistDir: config.frontendDistDir });
  httpServer.on("request", app);

  httpServer.listen(config.port, () => {
    logger.info(`CineOS API listening on http://localhost:${config.port}`);
    logger.info(`WebSocket server ready on ws://localhost:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    await cleanupQueueEvents();
    await cleanupRenderEvents();
    httpServer.close(async () => {
      await queue.close();
      await renderQueue.close();
      await redisConn.quit();
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
