/**
 * Render requests (API side): validate, snapshot the selected scenes, persist a MediaRender and
 * enqueue it on the BullMQ render queue. The worker does the FFmpeg work (media/renderProcessor.ts).
 */
import type { Queue } from "bullmq";
import mongoose from "mongoose";
import type { Server as SocketServer } from "socket.io";
import { z } from "zod";
import {
  DEFAULT_TARGET_SECONDS,
  MAX_TRAILER_SCENES,
  computeSceneDurations,
  findLibrarySoundtrack,
  pickCaption,
} from "../media/renderPipeline.js";
import { FFMPEG_INSTALL_HINT, checkMediaTools, type MediaToolStatus } from "../media/ffmpeg.js";
import { fileExists, projectLibraryDir, toAbsolute, toRelative } from "../media/storage.js";
import { AssetModel } from "../models/Asset.js";
import { AUDIO_MODES, MediaRenderModel, RENDER_KINDS, type MediaRenderDocument, type RenderInput, type RenderKind } from "../models/MediaRender.js";
import { ProjectModel } from "../models/Project.js";
import { SceneModel } from "../models/Scene.js";
import { ScreenplayModel } from "../models/Screenplay.js";
import { enqueueRender, renderJobId, type RenderJobData } from "../queue/renderQueue.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";

export const createRenderSchema = z
  .object({
    kind: z.enum(RENDER_KINDS).default("film"),
    sceneNumbers: z.array(z.number().int().min(1)).min(1).max(60).optional(),
    targetSeconds: z.number().int().min(15).max(180).optional(),
    audio: z.enum(AUDIO_MODES).default("score"),
  })
  .strict();
export type CreateRenderInput = z.infer<typeof createRenderSchema>;

// ffmpeg/ffprobe availability, re-checked at most once a minute.
let toolStatus: { at: number; status: MediaToolStatus } | null = null;
export async function mediaToolStatus(): Promise<MediaToolStatus> {
  if (!toolStatus || Date.now() - toolStatus.at > 60_000) {
    toolStatus = { at: Date.now(), status: await checkMediaTools() };
  }
  return toolStatus.status;
}

/** Evenly spaced pick so a trailer samples the whole story, not just the opening. */
function spreadPick<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]!);
}

export function serializeRender(doc: MediaRenderDocument): Record<string, unknown> {
  return doc.toJSON() as unknown as Record<string, unknown>;
}

export async function createRender(
  projectId: string,
  body: CreateRenderInput,
  queue: Queue<RenderJobData>,
  io?: SocketServer,
): Promise<MediaRenderDocument> {
  const tools = await mediaToolStatus();
  if (!tools.available) {
    throw new HttpError(503, "FFMPEG_UNAVAILABLE", `FFmpeg is not available, so nothing can be rendered. ${FFMPEG_INSTALL_HINT}`, tools.error);
  }

  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw HttpError.notFound(`Project ${projectId} not found.`);
  if (project.status === "generating") throw HttpError.conflict("Wait for generation to finish before rendering.");

  const [screenplay, allScenes] = await Promise.all([
    ScreenplayModel.findOne({ project: projectId }).lean(),
    SceneModel.find({ project: projectId }).sort({ sceneNumber: 1 }).lean(),
  ]);
  if (!screenplay || allScenes.length === 0) {
    throw HttpError.conflict("This production has no generated scenes yet. Run AI generation first.");
  }

  let scenes = allScenes;
  if (body.sceneNumbers) {
    const wanted = [...new Set(body.sceneNumbers)].sort((a, b) => a - b);
    const missing = wanted.filter((n) => !allScenes.some((s) => s.sceneNumber === n));
    if (missing.length > 0) throw HttpError.badRequest(`Scene(s) ${missing.join(", ")} do not exist in this screenplay.`);
    scenes = allScenes.filter((s) => wanted.includes(s.sceneNumber));
  }
  if (body.kind === "trailer") {
    if (body.sceneNumbers && scenes.length > MAX_TRAILER_SCENES) {
      throw HttpError.badRequest(`A trailer can use at most ${MAX_TRAILER_SCENES} scenes.`);
    }
    scenes = spreadPick(scenes, MAX_TRAILER_SCENES);
  }

  if (body.audio === "library" && !(await findLibrarySoundtrack(projectId))) {
    throw HttpError.badRequest(
      `Audio mode "library" needs a soundtrack file at ${toRelative(projectLibraryDir(projectId))}/soundtrack.(mp3|m4a|aac|wav|ogg|flac). ` +
        `Choose "score" or "none" instead.`,
    );
  }

  const kind: RenderKind = body.kind;
  const targetSeconds = body.targetSeconds ?? DEFAULT_TARGET_SECONDS[kind];
  const durations = computeSceneDurations(kind, scenes.map((s) => s.estimatedDurationMinutes), targetSeconds);

  // Link every scene to its versioned creative-memory asset (latest version on this branch).
  const branchId = project.branchId ?? "main";
  const usedCaptions = new Set<string>();
  const captions = scenes.map((scene) => pickCaption(kind, scene, usedCaptions));
  const inputs: RenderInput[] = await Promise.all(
    scenes.map(async (scene, i) => {
      const asset = await AssetModel.findOne({
        projectId: new mongoose.Types.ObjectId(projectId),
        type: "scene",
        branchId,
        "content.sceneNumber": scene.sceneNumber,
      })
        .sort({ version: -1 })
        .lean();
      return {
        sceneNumber: scene.sceneNumber,
        sceneId: scene._id,
        sceneAssetId: asset?._id ?? null,
        sceneAssetVersion: asset?.version ?? null,
        act: scene.act,
        heading: scene.heading,
        timeOfDay: scene.timeOfDay,
        summary: scene.summary,
        characters: scene.characters,
        caption: captions[i]!,
        durationSeconds: durations[i]!,
        visualSource: null,
        visualPath: null,
        visualReused: false,
        note: null,
      };
    }),
  );

  // A trailer is cut from the completed film sharing the most scenes with it (latest wins ties);
  // its scene visuals are content-addressed, so the trailer reuses that film's stills.
  let sourceFilm: { _id: mongoose.Types.ObjectId } | null = null;
  if (kind === "trailer") {
    const films = await MediaRenderModel.find({ projectId, kind: "film", status: "completed" })
      .sort({ version: -1 })
      .select("sceneNumbers")
      .lean();
    let best = 0;
    for (const film of films) {
      const overlap = film.sceneNumbers.filter((n) => inputs.some((i) => i.sceneNumber === n)).length;
      if (overlap > best) {
        best = overlap;
        sourceFilm = film;
      }
    }
  }

  const render = await createWithNextVersion(projectId, kind, {
    projectId: new mongoose.Types.ObjectId(projectId),
    projectTitle: project.title,
    titles: { title: screenplay.title, logline: screenplay.logline, genre: project.genre },
    kind,
    status: "queued",
    stage: "queued",
    progress: 0,
    sceneNumbers: scenes.map((s) => s.sceneNumber),
    targetSeconds,
    inputs,
    audio: { requested: body.audio, included: false, source: null, note: null },
    sourceRenderId: sourceFilm?._id ?? null,
    queuedAt: new Date(),
  });

  await enqueueRender(queue, { renderId: render.id as string, projectId });
  io?.to(projectId).emit("render:queued", { projectId, render: serializeRender(render) });
  logger.info(`[render] queued ${kind} v${render.version} (${render.id}) for project ${projectId}, scenes ${render.sceneNumbers.join(",")}`);
  return render;
}

/** version = previous max + 1 for this project+kind; retried on a concurrent-insert collision. */
async function createWithNextVersion(projectId: string, kind: RenderKind, attrs: Record<string, unknown>): Promise<MediaRenderDocument> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await MediaRenderModel.findOne({ projectId, kind }).sort({ version: -1 }).select("version").lean();
    try {
      return await MediaRenderModel.create({ ...attrs, version: (latest?.version ?? 0) + 1 });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000 || attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function listRenders(projectId: string): Promise<MediaRenderDocument[]> {
  if (!(await ProjectModel.exists({ _id: projectId }))) throw HttpError.notFound(`Project ${projectId} not found.`);
  return MediaRenderModel.find({ projectId }).sort({ createdAt: -1 }).limit(100);
}

export async function getRender(id: string): Promise<MediaRenderDocument> {
  if (!mongoose.isValidObjectId(id)) throw HttpError.badRequest("Invalid render id.");
  const render = await MediaRenderModel.findById(id);
  if (!render) throw HttpError.notFound(`Render ${id} not found.`);
  return render;
}

/** Absolute path of a completed render's MP4, or an HTTP error if it is not downloadable. */
export async function renderFilePath(render: MediaRenderDocument): Promise<string> {
  if (render.status !== "completed" || !render.output) throw HttpError.conflict(`Render is ${render.status}; there is no file to download yet.`);
  const abs = toAbsolute(render.output.path);
  if (!(await fileExists(abs))) {
    throw new HttpError(410, "MEDIA_MISSING", `The MP4 for this render is missing from local storage (${render.output.path}).`);
  }
  return abs;
}

/**
 * API startup: renders that were queued/rendering when the system stopped are put back on the
 * queue unless BullMQ still holds a live job for them (an active job from a crashed worker is
 * picked up again by BullMQ's stalled-job check).
 */
export async function recoverInterruptedRenders(queue: Queue<RenderJobData>): Promise<number> {
  const pending = await MediaRenderModel.find({ status: { $in: ["queued", "rendering"] } });
  let requeued = 0;
  for (const render of pending) {
    const job = await queue.getJob(renderJobId(render.id as string));
    const state = job ? await job.getState() : null;
    if (state && ["waiting", "active", "delayed", "prioritized", "waiting-children"].includes(state)) continue;
    if (job) await job.remove().catch(() => undefined);
    await MediaRenderModel.updateOne(
      { _id: render._id },
      { $set: { status: "queued", stage: "re-queued after interruption", progress: 0 } },
    );
    await enqueueRender(queue, { renderId: render.id as string, projectId: render.projectId.toString() });
    requeued++;
    logger.warn(`[render] recovery: re-queued ${render.kind} v${render.version} (${render.id}); previous job state: ${state ?? "missing"}`);
  }
  return requeued;
}
