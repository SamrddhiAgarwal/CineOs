import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { AgentName } from "../domain/types.js";

export { Queue };

export const AGENT_QUEUE_NAME = "cineos-agents";

/** Data stored with each BullMQ job. */
export interface AgentJobData {
  projectId: string;
  agent: AgentName;
}

/** Job retry configuration: 3 attempts with exponential back-off. */
export const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 100 },
} as const;

/** Singleton queue; pass the same IORedis connection the caller already created. */
export function createAgentQueue(connection: Redis): Queue<AgentJobData> {
  return new Queue<AgentJobData>(AGENT_QUEUE_NAME, { connection });
}

/** Identifies one generation run of a project: its generationStartedAt timestamp. */
export function agentRunKey(generationStartedAt: Date | string | null | undefined): string {
  return String(generationStartedAt ? new Date(generationStartedAt).getTime() : 0);
}

/**
 * Enqueue one agent job with jobId `{projectId}_{runKey}_{agent}`. Within one generation run the
 * id is stable, so BullMQ ignores duplicate adds (e.g. from startup recovery); a regeneration gets
 * a new runKey, so completed jobs from the previous run cannot block it. The relay in
 * sockets/socketServer.ts parses the id back into projectId + agent.
 * `_` separator: BullMQ forbids `:` in custom job ids; ObjectIds and timestamps never contain `_`.
 */
export async function enqueueAgent(
  queue: Queue<AgentJobData>,
  projectId: string,
  agent: AgentName,
  runKey: string,
): Promise<void> {
  await queue.add(agent, { projectId, agent }, {
    ...JOB_OPTS,
    jobId: `${projectId}_${runKey}_${agent}`,
  });
}

const AGENTS: readonly AgentName[] = ["producer", "story", "character", "screenwriter"];

/** Parse `{projectId}_{runKey}_{agent}` back to its parts. */
export function parseJobId(jobId: string): { projectId: string; agent: AgentName | null } {
  const parts = jobId.split("_");
  const agent = parts[parts.length - 1] as AgentName;
  if (parts.length < 3 || !AGENTS.includes(agent)) return { projectId: "", agent: null };
  return { projectId: parts[0]!, agent };
}
