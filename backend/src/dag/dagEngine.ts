import { AGENT_NAMES, type AgentName } from "../domain/types.js";

/**
 * Static DAG for the CineOS production workflow:
 *
 *   Producer
 *     ├── Story     ──────────────┐
 *     └── Character ──────────────┤
 *                           Screenwriter
 *
 * Story and Character are independent (no dependency between them) and can run in parallel.
 * Screenwriter waits for both.
 */
export const PRODUCTION_DAG: Readonly<Record<AgentName, readonly AgentName[]>> = {
  producer: [],
  story: ["producer"],
  character: ["producer"],
  screenwriter: ["story", "character"],
} as const;

export interface DagNodeStatus {
  agent: AgentName;
  status: string; // AgentRunStatus
}

/** Topological sort; throws if a cycle is detected. */
export function validateDag(): AgentName[] {
  const visited = new Set<AgentName>();
  const inStack = new Set<AgentName>();
  const order: AgentName[] = [];

  function visit(node: AgentName): void {
    if (inStack.has(node)) throw new Error(`Cycle detected in DAG at node: ${node}`);
    if (visited.has(node)) return;
    inStack.add(node);
    for (const dep of PRODUCTION_DAG[node]) visit(dep);
    inStack.delete(node);
    visited.add(node);
    order.push(node);
  }

  for (const agent of AGENT_NAMES) visit(agent);
  return order;
}

/** Nodes whose dependencies have all completed and whose status is 'pending'. */
export function getReadyNodes(runs: DagNodeStatus[]): AgentName[] {
  const statusMap = new Map(runs.map((r) => [r.agent, r.status]));
  return AGENT_NAMES.filter((agent) => {
    if (statusMap.get(agent) !== "pending") return false;
    return PRODUCTION_DAG[agent].every((dep) => statusMap.get(dep) === "completed");
  });
}

/** Nodes that become eligible after `completedAgent` completes (status still 'pending'). */
export function getNewlyEligibleNodes(completedAgent: AgentName, runs: DagNodeStatus[]): AgentName[] {
  const statusMap = new Map(runs.map((r) => [r.agent, r.status]));
  return AGENT_NAMES.filter((agent) => {
    if (statusMap.get(agent) !== "pending") return false;
    const deps = PRODUCTION_DAG[agent];
    return deps.includes(completedAgent) && deps.every((dep) => statusMap.get(dep) === "completed");
  });
}

/** All agents that DIRECTLY depend on `agent`. */
export function getDependents(agent: AgentName): AgentName[] {
  return AGENT_NAMES.filter((a) => PRODUCTION_DAG[a].includes(agent));
}

/** All agents that transitively depend on `agent` (BFS). */
export function getTransitiveDependents(agent: AgentName): AgentName[] {
  const result = new Set<AgentName>();
  const queue: AgentName[] = [agent];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const dep of getDependents(curr)) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...result];
}

/** Whether all nodes are in a terminal state (completed / failed / skipped). */
export function isWorkflowComplete(runs: DagNodeStatus[]): boolean {
  return runs.every((r) => ["completed", "failed", "skipped"].includes(r.status));
}
