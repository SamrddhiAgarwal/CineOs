import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CreateRenderInput, MediaRender, RenderSocketEvents } from "../api/types";
import { getSocket, subscribeProject } from "./useWorkflowSocket";

/**
 * Media history for a production with live FFmpeg render status.
 * Initial state comes from the REST API; updates arrive as render:* Socket.IO events
 * relayed from the BullMQ render worker. On reconnect the list is re-fetched.
 */
export function useRenders(projectId: string) {
  const [renders, setRenders] = useState<MediaRender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Last live event per render, so the UI can show that updates arrive over WebSockets. */
  const [lastEvent, setLastEvent] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      setRenders(await api.listRenders(projectId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    const socket = getSocket();
    const release = subscribeProject(projectId);

    const upsert = (render: MediaRender, event: string) => {
      if (render.projectId !== projectId) return;
      setRenders((prev) => {
        const i = prev.findIndex((r) => r.id === render.id);
        if (i === -1) return [render, ...prev];
        const next = [...prev];
        next[i] = render;
        return next;
      });
      setLastEvent((prev) => ({ ...prev, [render.id]: event }));
    };

    const onQueued = (d: RenderSocketEvents["render:queued"]) => upsert(d.render, "render:queued");
    const onStarted = (d: RenderSocketEvents["render:started"]) => upsert(d.render, "render:started");
    const onCompleted = (d: RenderSocketEvents["render:completed"]) => upsert(d.render, "render:completed");
    const onRetrying = (d: RenderSocketEvents["render:retrying"]) => upsert(d.render, "render:retrying");
    const onFailed = (d: RenderSocketEvents["render:failed"]) => upsert(d.render, "render:failed");
    const onProgress = (d: RenderSocketEvents["render:progress"]) => {
      if (d.projectId !== projectId) return;
      setRenders((prev) =>
        prev.map((r) =>
          r.id === d.renderId && r.status !== "completed" && r.status !== "failed"
            ? { ...r, status: "rendering", stage: d.stage, progress: d.progress }
            : r,
        ),
      );
      setLastEvent((prev) => ({ ...prev, [d.renderId]: "render:progress" }));
    };
    const onReconnect = () => void reload();

    socket.on("render:queued", onQueued);
    socket.on("render:started", onStarted);
    socket.on("render:progress", onProgress);
    socket.on("render:completed", onCompleted);
    socket.on("render:retrying", onRetrying);
    socket.on("render:failed", onFailed);
    socket.on("connect", onReconnect);
    return () => {
      socket.off("render:queued", onQueued);
      socket.off("render:started", onStarted);
      socket.off("render:progress", onProgress);
      socket.off("render:completed", onCompleted);
      socket.off("render:retrying", onRetrying);
      socket.off("render:failed", onFailed);
      socket.off("connect", onReconnect);
      release();
    };
  }, [projectId, reload]);

  const requestRender = useCallback(
    async (input: CreateRenderInput) => {
      setSubmitting(true);
      try {
        const render = await api.createRender(projectId, input);
        setRenders((prev) => (prev.some((r) => r.id === render.id) ? prev : [render, ...prev]));
        setError(null);
        return render;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [projectId],
  );

  return { renders, loading, error, submitting, lastEvent, requestRender, reload };
}
