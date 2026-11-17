import type { AgentName, AgentRun } from "../api/types";
import { StatusBadge } from "./StatusBadge";

const AGENT_INFO: Record<AgentName, { label: string; role: string; deps: AgentName[] }> = {
  producer: { label: "Producer", role: "Production plan & task coordination", deps: [] },
  story: { label: "Story", role: "Premise, plot, synopsis, structure", deps: ["producer"] },
  character: { label: "Character", role: "Cast, motivations, relationships", deps: ["producer"] },
  screenwriter: { label: "Screenwriter", role: "Scenes, action, dialogue", deps: ["story", "character"] },
};

function duration(run: AgentRun): string | null {
  if (!run.startedAt) return null;
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  return `${((end - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s`;
}

export function AgentPipeline({ runs }: { runs: AgentRun[] }) {
  const runMap = new Map(runs.map((r) => [r.agent, r]));

  return (
    <div className="dag-pipeline">
      {/* Row 1: Producer alone */}
      <div className="dag-row">
        <AgentCard run={runMap.get("producer")!} />
      </div>

      <div className="dag-fork-label">↙ parallel ↘</div>

      {/* Row 2: Story and Character in parallel */}
      <div className="dag-row dag-row-parallel">
        <AgentCard run={runMap.get("story")!} />
        <AgentCard run={runMap.get("character")!} />
      </div>

      <div className="dag-fork-label">↘ join ↙</div>

      {/* Row 3: Screenwriter after both */}
      <div className="dag-row">
        <AgentCard run={runMap.get("screenwriter")!} />
      </div>
    </div>
  );
}

function AgentCard({ run }: { run: AgentRun }) {
  if (!run) return null;
  const info = AGENT_INFO[run.agent];
  const time = duration(run);

  return (
    <div className={`dag-node step-${run.status}`}>
      <div className="pipeline-head">
        <strong>{info.label} Agent</strong>
        <StatusBadge status={run.status} />
      </div>
      <span className="muted small">{info.role}</span>
      {info.deps.length > 0 && (
        <span className="small muted">depends on: {info.deps.join(", ")}</span>
      )}
      <span className="small">
        {run.status === "queued" && "Queued in BullMQ…"}
        {run.provider === "mock" && run.status !== "queued" && "Mock output"}
        {run.provider === "gemini" && `Gemini · ${run.model}`}
        {time && ` · ${time}`}
        {run.attempts > 1 && ` · attempt ${run.attempts}`}
      </span>
      {run.error && <span className="small text-danger">{run.error}</span>}
    </div>
  );
}
