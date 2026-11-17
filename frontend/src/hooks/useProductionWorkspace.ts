import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { AgentName, AgentRunStatus, Character, ProductionPlan, Project, Screenplay, Story } from "../api/types";
import { useWorkflowSocket } from "./useWorkflowSocket";

export interface WorkspaceContent {
  plan?: ProductionPlan;
  story?: Story;
  characters?: Character[];
  screenplay?: Screenplay;
}

async function loadContent(id: string, completed: AgentName[]): Promise<WorkspaceContent> {
  const has = (agent: AgentName) => completed.includes(agent);
  const [plan, story, characters, screenplay] = await Promise.all([
    has("producer") ? api.getPlan(id) : undefined,
    has("story") ? api.getStory(id) : undefined,
    has("character") ? api.getCharacters(id) : undefined,
    has("screenwriter") ? api.getScreenplay(id) : undefined,
  ]);
  return { plan, story, characters, screenplay };
}

/**
 * Loads a project and its generated content.
 * Uses Socket.IO push events (from the BullMQ worker via the API) instead of polling.
 * Falls back to fetching current state from the API on reconnect so missed events don't leave stale UI.
 */
export function useProductionWorkspace(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [content, setContent] = useState<WorkspaceContent>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const contentKey = useRef("");

  const syncContent = useCallback(
    async (p: Pick<Project, "agentRuns" | "generationStartedAt">) => {
      const completed = p.agentRuns.filter((r) => r.status === "completed").map((r) => r.agent);
      const key = `${p.generationStartedAt}|${completed.join(",")}`;
      if (key === contentKey.current) return;
      contentKey.current = key;
      try {
        setContent(await loadContent(id, completed));
      } catch {
        // Content might not be ready yet; ignore and wait for next event.
      }
    },
    [id],
  );

  const refresh = useCallback(async () => {
    try {
      const p = await api.getProject(id);
      setProject(p);
      setError(null);
      await syncContent(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, syncContent]);

  // Initial load
  useEffect(() => {
    contentKey.current = "";
    setProject(null);
    setContent({});
    void refresh();
  }, [refresh]);

  // Socket.IO event handlers — update project state and fetch new content as it arrives.
  useWorkflowSocket(id, {
    onWorkflowCreated: () => void refresh(),
    onAgentStarted: ({ agent }) => {
      setProject((prev) =>
        prev
          ? {
              ...prev,
              agentRuns: prev.agentRuns.map((r) =>
                r.agent === agent ? { ...r, status: "running" as AgentRunStatus, startedAt: new Date().toISOString() } : r,
              ),
            }
          : prev,
      );
    },
    onAgentCompleted: ({ agent }) => {
      setProject((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          agentRuns: prev.agentRuns.map((r) =>
            r.agent === agent ? { ...r, status: "completed" as AgentRunStatus, finishedAt: new Date().toISOString() } : r,
          ),
        };
        void syncContent(updated);
        return updated;
      });
    },
    onAgentFailed: ({ agent, error: err }) => {
      setProject((prev) =>
        prev
          ? {
              ...prev,
              agentRuns: prev.agentRuns.map((r) =>
                r.agent === agent
                  ? { ...r, status: "failed" as AgentRunStatus, finishedAt: new Date().toISOString(), error: err }
                  : r,
              ),
            }
          : prev,
      );
    },
    onJobRetrying: ({ agent, attempt, maxAttempts }) => {
      setProject((prev) =>
        prev
          ? {
              ...prev,
              agentRuns: prev.agentRuns.map((r) =>
                r.agent === agent
                  ? { ...r, status: "running" as AgentRunStatus, error: `Retrying (attempt ${attempt + 1}/${maxAttempts})…` }
                  : r,
              ),
            }
          : prev,
      );
    },
    onWorkflowCompleted: ({ status }) => {
      // Fetch the final project state so all fields (including lastError) are accurate.
      void refresh();
      setProject((prev) => (prev ? { ...prev, status } : prev));
    },
    // On reconnect: re-fetch everything so missed events don't leave stale UI.
    onReconnect: () => void refresh(),
  });

  const startGeneration = useCallback(async () => {
    setStarting(true);
    try {
      await api.startGeneration(id);
      // The workflow:created socket event will trigger refresh(); no need to do it here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [id]);

  return { project, content, error, starting, startGeneration };
}
