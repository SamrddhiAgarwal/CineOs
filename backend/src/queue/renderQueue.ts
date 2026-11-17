import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export const RENDER_QUEUE_NAME = "cineos-render";

export interface RenderJobData {
  renderId: string;
  projectId: string;
}

/** FFmpeg failures are mostly deterministic, so one retry (for transient I/O problems) is enough. */
export const RENDER_JOB_OPTS = {
  attempts: 2,
  backoff: { type: "fixed" as const, delay: 3_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
} as const;

export function createRenderQueue(connection: Redis): Queue<RenderJobData> {
  return new Queue<RenderJobData>(RENDER_QUEUE_NAME, { connection });
}

export function renderJobId(renderId: string): string {
  return `render_${renderId}`;
}

/** One job per render document; BullMQ ignores the add while a job with this id is waiting/active. */
export async function enqueueRender(queue: Queue<RenderJobData>, data: RenderJobData): Promise<void> {
  await queue.add("render", data, { ...RENDER_JOB_OPTS, jobId: renderJobId(data.renderId) });
}
