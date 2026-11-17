/**
 * Socket.IO server + QueueEvents relay.
 *
 * Clients join a room by projectId: socket.emit('subscribe', projectId).
 * The QueueEvents listener translates BullMQ job lifecycle events into Socket.IO events
 * emitted to the appropriate room, so the frontend gets live updates without polling.
 *
 * Events emitted to clients:
 *   workflow:created   — generation started
 *   agent:started      — agent job began processing
 *   agent:completed    — agent job succeeded
 *   agent:failed       — agent job exhausted all retries
 *   job:retrying       — agent job failed but will retry
 *   workflow:completed — all agents done (project status: completed | failed)
 */
import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import { Job, Queue, QueueEvents } from "bullmq";
import { Server } from "socket.io";
import { createRedisConnection } from "../queue/connection.js";
import { MediaRenderModel } from "../models/MediaRender.js";
import { ProjectModel } from "../models/Project.js";
import { AGENT_QUEUE_NAME, parseJobId, type AgentJobData } from "../queue/queues.js";
import { RENDER_QUEUE_NAME } from "../queue/renderQueue.js";
import type { RenderProgressData } from "../media/renderProcessor.js";
import { logger } from "../utils/logger.js";

export type CineOSSocketServer = Server;

export function createSocketServer(
  httpServer: HttpServer<typeof IncomingMessage, typeof ServerResponse>,
): CineOSSocketServer {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    socket.on("subscribe", (projectId: string) => {
      void socket.join(projectId);
      logger.info(`[socket] client ${socket.id} subscribed to project ${projectId}`);
    });
    socket.on("unsubscribe", (projectId: string) => {
      void socket.leave(projectId);
    });
    socket.on("disconnect", () => {
      logger.info(`[socket] client ${socket.id} disconnected`);
    });
  });

  return io;
}

/**
 * Attach QueueEvents listeners that relay BullMQ job events to Socket.IO rooms.
 * Returns a cleanup function to close the listener on shutdown.
 */
export function attachQueueEventsRelay(
  io: CineOSSocketServer,
  queue: Queue<AgentJobData>,
  redisUrl: string,
): () => Promise<void> {
  // QueueEvents needs its own dedicated Redis connection (it subscribes/blocks continuously).
  const queueEventsConn = createRedisConnection(redisUrl);
  const queueEvents = new QueueEvents(AGENT_QUEUE_NAME, { connection: queueEventsConn });

  queueEvents.on("active", async ({ jobId }) => {
    const { projectId, agent } = parseJobId(jobId);
    if (!projectId || !agent) return;
    io.to(projectId).emit("agent:started", { projectId, agent });
  });

  queueEvents.on("completed", async ({ jobId }) => {
    const { projectId, agent } = parseJobId(jobId);
    if (!projectId || !agent) return;
    io.to(projectId).emit("agent:completed", { projectId, agent });

    try {
      const project = await ProjectModel.findById(projectId).lean();
      if (project && (project.status === "completed" || project.status === "failed")) {
        io.to(projectId).emit("workflow:completed", { projectId, status: project.status });
      }
    } catch (err) {
      logger.error("[socket] could not check workflow completion after agent:completed", err);
    }
  });

  queueEvents.on("failed", async ({ jobId }) => {
    const { projectId, agent } = parseJobId(jobId);
    if (!projectId || !agent) return;

    try {
      const job = await Job.fromId(queue, jobId);
      const maxAttempts = job?.opts?.attempts ?? 1;
      const attemptsMade = job?.attemptsMade ?? maxAttempts;
      if (attemptsMade < maxAttempts) {
        io.to(projectId).emit("job:retrying", { projectId, agent, attempt: attemptsMade, maxAttempts });
      }
    } catch (err) {
      logger.error("[socket] failed event handler error", err);
    }
  });

  queueEvents.on("retries-exhausted", async ({ jobId }) => {
    const { projectId, agent } = parseJobId(jobId);
    if (!projectId || !agent) return;
    // Fetch the error message from the last failed job attempt
    let errorMsg = "Agent failed after all retry attempts.";
    try {
      const job = await Job.fromId(queue, jobId);
      if (job?.failedReason) errorMsg = job.failedReason;
    } catch { /* ignore */ }
    io.to(projectId).emit("agent:failed", { projectId, agent, error: errorMsg });

    try {
      const project = await ProjectModel.findById(projectId).lean();
      if (project && (project.status === "completed" || project.status === "failed")) {
        io.to(projectId).emit("workflow:completed", { projectId, status: project.status });
      }
    } catch (err) {
      logger.error("[socket] could not check workflow completion after retries-exhausted", err);
    }
  });

  queueEvents.on("error", (err) => {
    logger.error("[socket] QueueEvents error", err);
  });

  return async () => {
    await queueEvents.close();
    await queueEventsConn.quit();
  };
}

/**
 * Relay FFmpeg render jobs to the project room.
 *
 * Events emitted to clients:
 *   render:queued    — emitted directly by the API when a render is requested
 *   render:started   — the worker picked the job up      { projectId, render }
 *   render:progress  — stage + percent from the worker    { projectId, renderId, stage, progress }
 *   render:completed — MP4 written and validated          { projectId, render }
 *   render:retrying  — attempt failed, BullMQ will retry  { projectId, render }
 *   render:failed    — no attempts left                   { projectId, render }
 */
export function attachRenderEventsRelay(io: CineOSSocketServer, redisUrl: string): () => Promise<void> {
  const conn = createRedisConnection(redisUrl);
  const events = new QueueEvents(RENDER_QUEUE_NAME, { connection: conn });

  const renderIdOf = (jobId: string) => (jobId.startsWith("render_") ? jobId.slice("render_".length) : null);

  /** Emit the persisted render document (the worker writes MongoDB before BullMQ reports the event). */
  const emitRender = async (jobId: string, pick: (status: string) => string | null) => {
    const renderId = renderIdOf(jobId);
    if (!renderId) return;
    try {
      const render = await MediaRenderModel.findById(renderId);
      if (!render) return;
      const event = pick(render.status);
      if (!event) return;
      const projectId = render.projectId.toString();
      io.to(projectId).emit(event, { projectId, render: render.toJSON() });
    } catch (err) {
      logger.error(`[socket] render relay failed for ${jobId}`, err);
    }
  };

  events.on("active", ({ jobId }) => void emitRender(jobId, () => "render:started"));
  events.on("completed", ({ jobId }) => void emitRender(jobId, (s) => (s === "completed" ? "render:completed" : null)));
  events.on("failed", ({ jobId }) => void emitRender(jobId, (s) => (s === "failed" ? "render:failed" : "render:retrying")));
  events.on("progress", ({ data }) => {
    const p = data as unknown as RenderProgressData;
    if (p && typeof p === "object" && p.projectId) io.to(p.projectId).emit("render:progress", p);
  });
  events.on("error", (err) => logger.error("[socket] render QueueEvents error", err));

  return async () => {
    await events.close();
    await conn.quit();
  };
}
