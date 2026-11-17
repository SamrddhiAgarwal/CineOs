import type { AgentRunStatus, ProjectStatus } from "../api/types";

const CLASS: Record<ProjectStatus | AgentRunStatus, string> = {
  draft: "pill-neutral",
  pending: "pill-neutral",
  queued: "pill-queued",
  generating: "pill-running",
  running: "pill-running",
  completed: "pill-ok",
  failed: "pill-danger",
  skipped: "pill-neutral",
};

export function StatusBadge({ status }: { status: ProjectStatus | AgentRunStatus }) {
  return <span className={`pill ${CLASS[status]}`}>{status}</span>;
}
