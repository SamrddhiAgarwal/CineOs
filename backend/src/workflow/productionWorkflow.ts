/**
 * Production workflow controller — API-server side.
 *
 * Responsible for:
 *   1. Atomically transitioning a project into `generating` state.
 *   2. Clearing any previous generated content.
 *   3. Enqueueing the Producer agent job in BullMQ; the worker picks it up and, on
 *      completion, enqueues the next eligible nodes (Story and Character in parallel).
 *   4. Recovery at startup: re-enqueue any nodes that were `queued` or eligible
 *      `pending` when the server last stopped.
 *
 * Actual agent execution lives in agentRunner.ts, which runs in the worker process.
 */
import type { Queue } from "bullmq";
import type { Server as SocketServer } from "socket.io";
import { getReadyNodes } from "../dag/dagEngine.js";
import { freshAgentRuns, ProjectModel, type ProjectDocument } from "../models/Project.js";
import { clearGeneratedContent, markAgentQueued } from "./agentRunner.js";
import { agentRunKey, enqueueAgent, type AgentJobData } from "../queue/queues.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";

export class ProductionWorkflow {
  constructor(
    private readonly queue: Queue<AgentJobData>,
    private readonly io?: SocketServer,
  ) {}

  /** Atomically move a project into `generating`, clear prior content, and enqueue the producer job. */
  async start(projectId: string, reusedAssetIds: string[] = []): Promise<ProjectDocument> {
    const project = await ProjectModel.findOneAndUpdate(
      { _id: projectId, status: { $ne: "generating" } },
      {
        $set: {
          status: "generating",
          agentRuns: freshAgentRuns(),
          llm: null,
          generationStartedAt: new Date(),
          generationCompletedAt: null,
          lastError: null,
          reusedAssetIds,
        },
      },
      { returnDocument: "after" },
    );

    if (!project) {
      const exists = await ProjectModel.exists({ _id: projectId });
      if (!exists) throw HttpError.notFound(`Project ${projectId} not found.`);
      throw HttpError.conflict("Generation is already running for this project.");
    }

    await clearGeneratedContent(projectId);
    await enqueueAgent(this.queue, projectId, "producer", agentRunKey(project.generationStartedAt));
    await markAgentQueued(projectId, "producer");

    this.io?.to(projectId).emit("workflow:created", { projectId });
    logger.info(`[workflow] started for project ${projectId}, producer job enqueued`);

    return project;
  }

  /**
   * On API server startup: re-enqueue any agent jobs that were lost when the server stopped.
   * BullMQ's jobId deduplication prevents double-processing for jobs still in the queue.
   */
  static async recoverInterrupted(queue: Queue<AgentJobData>): Promise<number> {
    const projects = await ProjectModel.find({ status: "generating" }).lean();
    if (projects.length === 0) return 0;

    let enqueued = 0;
    for (const project of projects) {
      const statusMap = new Map(project.agentRuns.map((r) => [r.agent, r.status]));

      // Re-enqueue jobs that were queued in BullMQ (might have been lost if Redis was wiped)
      // or that are eligible pending nodes (server stopped before enqueueing them).
      const toEnqueue = getReadyNodes(project.agentRuns.map((r) => ({
        agent: r.agent,
        status: r.status === "queued" ? "pending" : r.status, // treat queued as pending for re-check
      })));

      // Also re-enqueue explicitly queued runs (they should be in BullMQ, but re-add for safety)
      for (const run of project.agentRuns) {
        if (run.status === "queued" && !toEnqueue.includes(run.agent)) {
          toEnqueue.push(run.agent);
        }
      }

      for (const agent of toEnqueue) {
        await enqueueAgent(queue, project._id.toString(), agent, agentRunKey(project.generationStartedAt));
        if (statusMap.get(agent) !== "queued") {
          await markAgentQueued(project._id.toString(), agent);
        }
        enqueued++;
        logger.info(`[workflow] recovery: re-enqueued ${agent} for project ${project._id}`);
      }
    }
    return enqueued;
  }
}
