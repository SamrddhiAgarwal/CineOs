/**
 * Socket.IO connection for real-time workflow events.
 *
 * Connects once per session, subscribes to a project room when given a projectId,
 * and fires callbacks for each workflow event type.
 * On reconnection, calls onReconnect so the page can re-fetch persisted state from the API.
 */
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { WorkflowSocketEvents } from "../api/types";

export interface WorkflowSocketCallbacks {
  onWorkflowCreated?: (data: WorkflowSocketEvents["workflow:created"]) => void;
  onAgentStarted?: (data: WorkflowSocketEvents["agent:started"]) => void;
  onAgentCompleted?: (data: WorkflowSocketEvents["agent:completed"]) => void;
  onAgentFailed?: (data: WorkflowSocketEvents["agent:failed"]) => void;
  onJobRetrying?: (data: WorkflowSocketEvents["job:retrying"]) => void;
  onWorkflowCompleted?: (data: WorkflowSocketEvents["workflow:completed"]) => void;
  onReconnect?: () => void;
}

// Shared socket singleton — one connection for the whole app lifetime.
let sharedSocket: Socket | null = null;
// Several hooks can listen to the same project room; only leave it when the last one unmounts.
const roomRefs = new Map<string, number>();

export function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({ transports: ["websocket", "polling"] });
    // After a reconnect the server has forgotten our rooms.
    sharedSocket.on("connect", () => {
      for (const room of roomRefs.keys()) sharedSocket!.emit("subscribe", room);
    });
  }
  return sharedSocket;
}

/** Join a project's room; returns a release function. */
export function subscribeProject(projectId: string): () => void {
  const socket = getSocket();
  const count = roomRefs.get(projectId) ?? 0;
  roomRefs.set(projectId, count + 1);
  if (count === 0) socket.emit("subscribe", projectId);
  return () => {
    const left = (roomRefs.get(projectId) ?? 1) - 1;
    if (left > 0) {
      roomRefs.set(projectId, left);
    } else {
      roomRefs.delete(projectId);
      socket.emit("unsubscribe", projectId);
    }
  };
}

export function useWorkflowSocket(projectId: string | null, callbacks: WorkflowSocketCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const socket = getSocket();
    const release = projectId ? subscribeProject(projectId) : null;

    const handleWorkflowCreated = (data: WorkflowSocketEvents["workflow:created"]) => {
      if (data.projectId === projectId) callbacksRef.current.onWorkflowCreated?.(data);
    };
    const handleAgentStarted = (data: WorkflowSocketEvents["agent:started"]) => {
      if (data.projectId === projectId) callbacksRef.current.onAgentStarted?.(data);
    };
    const handleAgentCompleted = (data: WorkflowSocketEvents["agent:completed"]) => {
      if (data.projectId === projectId) callbacksRef.current.onAgentCompleted?.(data);
    };
    const handleAgentFailed = (data: WorkflowSocketEvents["agent:failed"]) => {
      if (data.projectId === projectId) callbacksRef.current.onAgentFailed?.(data);
    };
    const handleJobRetrying = (data: WorkflowSocketEvents["job:retrying"]) => {
      if (data.projectId === projectId) callbacksRef.current.onJobRetrying?.(data);
    };
    const handleWorkflowCompleted = (data: WorkflowSocketEvents["workflow:completed"]) => {
      if (data.projectId === projectId) callbacksRef.current.onWorkflowCompleted?.(data);
    };
    const handleReconnect = () => {
      // Rooms are re-joined by getSocket(); fetch current state so missed events don't leave stale UI.
      callbacksRef.current.onReconnect?.();
    };

    socket.on("workflow:created", handleWorkflowCreated);
    socket.on("agent:started", handleAgentStarted);
    socket.on("agent:completed", handleAgentCompleted);
    socket.on("agent:failed", handleAgentFailed);
    socket.on("job:retrying", handleJobRetrying);
    socket.on("workflow:completed", handleWorkflowCompleted);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("workflow:created", handleWorkflowCreated);
      socket.off("agent:started", handleAgentStarted);
      socket.off("agent:completed", handleAgentCompleted);
      socket.off("agent:failed", handleAgentFailed);
      socket.off("job:retrying", handleJobRetrying);
      socket.off("workflow:completed", handleWorkflowCompleted);
      socket.off("connect", handleReconnect);
      release?.();
    };
  }, [projectId]);
}
