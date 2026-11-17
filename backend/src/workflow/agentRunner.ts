/**
 * Agent execution layer used by the BullMQ worker.
 *
 * Handles: input gathering from MongoDB, running the LLM agent, persisting the output,
 * updating per-agent run status, and enqueueing the next eligible agents.
 */
import type { Queue } from "bullmq";
import type { Types } from "mongoose";
import { characterAgent } from "../agents/characterAgent.js";
import { producerAgent, type ProductionPlanOutput } from "../agents/producerAgent.js";
import { screenwriterAgent } from "../agents/screenwriterAgent.js";
import { storyAgent } from "../agents/storyAgent.js";
import { getNewlyEligibleNodes, isWorkflowComplete } from "../dag/dagEngine.js";
import type { AgentName, DelegateAgentName, ProjectBrief, Provenance } from "../domain/types.js";
import type { LlmClient } from "../llm/index.js";
import { CharacterModel } from "../models/Character.js";
import { ProductionPlanModel } from "../models/ProductionPlan.js";
import { ProjectModel } from "../models/Project.js";
import { SceneModel } from "../models/Scene.js";
import { ScreenplayModel } from "../models/Screenplay.js";
import { StoryModel } from "../models/Story.js";
import { agentRunKey, enqueueAgent, type AgentJobData } from "../queue/queues.js";
import { saveAssetVersion, saveCharacterAssets } from "../services/assetService.js";
import { getAssetContext } from "../services/contextService.js";
import { logger } from "../utils/logger.js";

// ── Status helpers ────────────────────────────────────────────────────────────

export async function markAgentQueued(projectId: string, agent: AgentName): Promise<void> {
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { "agentRuns.$[elem].status": "queued", "agentRuns.$[elem].queuedAt": new Date() } },
    { arrayFilters: [{ "elem.agent": agent }] },
  );
}

export async function markAgentRunning(projectId: string, agent: AgentName): Promise<void> {
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { "agentRuns.$[elem].status": "running", "agentRuns.$[elem].startedAt": new Date() } },
    { arrayFilters: [{ "elem.agent": agent }] },
  );
}

export async function markAgentCompleted(
  projectId: string,
  agent: AgentName,
  provenance: { provider: string; model: string | null },
  attempts: number,
): Promise<void> {
  await ProjectModel.updateOne(
    { _id: projectId },
    {
      $set: {
        "agentRuns.$[elem].status": "completed",
        "agentRuns.$[elem].finishedAt": new Date(),
        "agentRuns.$[elem].provider": provenance.provider,
        "agentRuns.$[elem].model": provenance.model,
        "agentRuns.$[elem].attempts": attempts,
      },
    },
    { arrayFilters: [{ "elem.agent": agent }] },
  );
}

export async function markAgentFailed(
  projectId: string,
  agent: AgentName,
  errorMsg: string,
  attempts: number,
): Promise<void> {
  await ProjectModel.updateOne(
    { _id: projectId },
    {
      $set: {
        "agentRuns.$[elem].status": "failed",
        "agentRuns.$[elem].finishedAt": new Date(),
        "agentRuns.$[elem].error": errorMsg,
        "agentRuns.$[elem].attempts": attempts,
      },
    },
    { arrayFilters: [{ "elem.agent": agent }] },
  );
}

export async function markDependentsSkipped(projectId: string, dependents: AgentName[], reason: string): Promise<void> {
  if (dependents.length === 0) return;
  await ProjectModel.updateOne(
    { _id: projectId },
    {
      $set: {
        "agentRuns.$[elem].status": "skipped",
        "agentRuns.$[elem].error": reason,
      },
    },
    { arrayFilters: [{ "elem.agent": { $in: dependents }, "elem.status": { $in: ["pending", "queued"] } }] },
  );
}

// ── Input gathering ───────────────────────────────────────────────────────────

function taskBrief(plan: ProductionPlanOutput, agent: DelegateAgentName): string {
  const task = plan.creativeTasks.find((t) => t.agent === agent);
  if (!task) return "";
  const deliverables = task.deliverables.length > 0 ? `\nDeliverables: ${task.deliverables.join("; ")}` : "";
  return `${task.title}\n${task.brief}${deliverables}`;
}

async function getPlan(projectId: string): Promise<ProductionPlanOutput> {
  const plan = await ProductionPlanModel.findOne({ project: projectId }).lean();
  if (!plan) throw new Error(`No production plan found for project ${projectId}.`);
  return plan as unknown as ProductionPlanOutput;
}

// ── Persistence (idempotent: delete-then-create for stall-recovery safety) ───
// Working-state models (Story, Character, etc.) are replaced on each run.
// Asset model receives NEW version documents — never overwrites existing ones.

async function persistOutput(
  projectId: string | Types.ObjectId,
  agent: AgentName,
  data: unknown,
  provenance: Provenance,
  sourceAssetIds: string[],
  generationPromptSummary: string,
): Promise<void> {
  const pid = projectId.toString();
  switch (agent) {
    case "producer": {
      const d = data as ProductionPlanOutput;
      await ProductionPlanModel.deleteMany({ project: projectId });
      await ProductionPlanModel.create({ project: projectId, ...d, provenance });
      await saveAssetVersion({
        projectId: pid, type: "plan", content: d,
        provenance, sourceAssetIds, generationPrompt: generationPromptSummary,
        tags: d.themes ?? [],
      });
      break;
    }
    case "story": {
      await StoryModel.deleteMany({ project: projectId });
      await StoryModel.create({ project: projectId, ...(data as object), provenance });
      const s = data as Record<string, unknown>;
      await saveAssetVersion({
        projectId: pid, type: "story", content: data as object,
        provenance, sourceAssetIds, generationPrompt: generationPromptSummary,
        tags: (s["themes"] as string[] | undefined) ?? [],
      });
      break;
    }
    case "character": {
      const characters = (data as { characters: unknown[] }).characters;
      await CharacterModel.deleteMany({ project: projectId });
      await CharacterModel.insertMany(
        characters.map((char, order) => ({ project: projectId, order, ...(char as object), provenance })),
      );
      // Save each character as an individually addressable asset
      await saveCharacterAssets({
        projectId: pid, characters, provenance, sourceAssetIds,
        generationPrompt: generationPromptSummary,
      });
      break;
    }
    case "screenwriter": {
      const d = data as {
        title: string;
        logline: string;
        scenes: Array<{ estimatedDurationMinutes: number; sceneNumber: number; location: string } & object>;
      };
      await ScreenplayModel.deleteMany({ project: projectId });
      await SceneModel.deleteMany({ project: projectId });
      const runtime = d.scenes.reduce((sum, s) => sum + s.estimatedDurationMinutes, 0);
      const screenplay = await ScreenplayModel.create({
        project: projectId,
        title: d.title,
        logline: d.logline,
        sceneCount: d.scenes.length,
        estimatedRuntimeMinutes: Math.round(runtime * 10) / 10,
        provenance,
      });
      await SceneModel.insertMany(
        d.scenes.map((scene) => ({ project: projectId, screenplay: screenplay._id as Types.ObjectId, ...scene, provenance })),
      );
      // Save screenplay as a versioned asset (scenes embedded in content)
      await saveAssetVersion({
        projectId: pid, type: "screenplay",
        content: { title: d.title, logline: d.logline, sceneCount: d.scenes.length, estimatedRuntimeMinutes: Math.round(runtime * 10) / 10, scenes: d.scenes },
        provenance, sourceAssetIds, generationPrompt: generationPromptSummary,
      });
      // Save each scene as an individually addressable asset (sequential to avoid version races)
      for (const scene of d.scenes) {
        await saveAssetVersion({
          projectId: pid, type: "scene", content: scene,
          provenance, sourceAssetIds, generationPrompt: generationPromptSummary,
          tags: [scene.location],
          stableFilter: { "content.sceneNumber": scene.sceneNumber },
        });
      }
      break;
    }
  }
}

// ── Main job processor ────────────────────────────────────────────────────────

/**
 * Full execution of one agent job, called from the BullMQ worker processor.
 * Marks running → completed in MongoDB, persists output, enqueues the next eligible nodes.
 */
export async function processAgentJob(
  jobData: AgentJobData,
  llm: LlmClient,
  queue: Queue<AgentJobData>,
  attemptsMade: number,
): Promise<void> {
  const { projectId, agent } = jobData;
  const started = Date.now();
  logger.info(`[worker] ${agent} agent started (attempt ${attemptsMade}) for project ${projectId}`);

  await markAgentRunning(projectId, agent);

  const projectDoc = await ProjectModel.findById(projectId).lean();
  if (!projectDoc) throw new Error(`Project ${projectId} not found.`);
  const projectBrief: ProjectBrief = { title: projectDoc.title, idea: projectDoc.idea, genre: projectDoc.genre, durationMinutes: projectDoc.durationMinutes };

  // Load reused context from other productions (included in every agent's prompt)
  const reusedContext = await getAssetContext(projectDoc.reusedAssetIds ?? []);
  const sourceAssetIds = reusedContext.map((c) => c.assetId);
  if (reusedContext.length > 0) {
    logger.info(`[worker] ${agent} has ${reusedContext.length} reused context item(s) from other productions`);
  }

  let result;
  let generationPromptSummary = "";

  switch (agent) {
    case "producer":
      generationPromptSummary = JSON.stringify({ project: projectBrief, reusedCount: reusedContext.length }).slice(0, 500);
      result = await producerAgent.run({ project: projectBrief, reusedContext }, llm);
      break;
    case "story": {
      const plan = await getPlan(projectId);
      generationPromptSummary = JSON.stringify({ project: projectBrief, planLogline: plan.logline, reusedCount: reusedContext.length }).slice(0, 500);
      result = await storyAgent.run({ project: projectBrief, plan, brief: taskBrief(plan, "story"), reusedContext }, llm);
      break;
    }
    case "character": {
      const plan = await getPlan(projectId);
      const storyDoc = await StoryModel.findOne({ project: projectId }).lean();
      generationPromptSummary = JSON.stringify({ project: projectBrief, planLogline: plan.logline, hasStory: !!storyDoc, reusedCount: reusedContext.length }).slice(0, 500);
      result = await characterAgent.run(
        {
          project: projectBrief,
          plan,
          story: storyDoc ? (storyDoc as Parameters<typeof characterAgent.run>[0]["story"]) : undefined,
          brief: taskBrief(plan, "character"),
          reusedContext,
        },
        llm,
      );
      break;
    }
    case "screenwriter": {
      const plan = await getPlan(projectId);
      const storyDoc = await StoryModel.findOne({ project: projectId }).lean();
      const charDocs = await CharacterModel.find({ project: projectId }).sort({ order: 1 }).lean();
      if (!storyDoc) throw new Error(`No story found for project ${projectId}.`);
      generationPromptSummary = JSON.stringify({ project: projectBrief, planLogline: plan.logline, reusedCount: reusedContext.length }).slice(0, 500);
      result = await screenwriterAgent.run(
        {
          project: projectBrief,
          plan,
          story: storyDoc as Parameters<typeof screenwriterAgent.run>[0]["story"],
          characters: charDocs as Parameters<typeof screenwriterAgent.run>[0]["characters"],
          brief: taskBrief(plan, "screenwriter"),
          reusedContext,
        },
        llm,
      );
      break;
    }
  }

  await persistOutput(projectId, agent, result.data, result.provenance, sourceAssetIds, generationPromptSummary);
  await markAgentCompleted(projectId, agent, result.provenance, attemptsMade);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const usage = result.usage ? `, ${result.usage.inputTokens}/${result.usage.outputTokens} tokens` : "";
  logger.info(`[worker] ${agent} agent completed in ${elapsed}s${usage}`);

  // Enqueue nodes that are now eligible — guard with atomic status transition to prevent
  // double-enqueue when two parallel predecessors (story + character) complete simultaneously.
  const updatedProject = await ProjectModel.findById(projectId).lean();
  if (!updatedProject) return;

  const eligible = getNewlyEligibleNodes(agent, updatedProject.agentRuns);
  for (const next of eligible) {
    // Atomically flip pending → queued; skip if another worker already did it
    const result = await ProjectModel.updateOne(
      { _id: projectId, "agentRuns": { $elemMatch: { agent: next, status: "pending" } } },
      { $set: { "agentRuns.$[elem].status": "queued", "agentRuns.$[elem].queuedAt": new Date() } },
      { arrayFilters: [{ "elem.agent": next, "elem.status": "pending" }] },
    );
    if (result.modifiedCount === 0) continue; // already queued by the other parallel predecessor
    await enqueueAgent(queue, projectId, next, agentRunKey(updatedProject.generationStartedAt));
    logger.info(`[worker] enqueued ${next} agent for project ${projectId}`);
  }

  // Check if workflow is complete
  const finalProject = eligible.length > 0 ? await ProjectModel.findById(projectId).lean() : updatedProject;
  if (!finalProject) return;

  if (isWorkflowComplete(finalProject.agentRuns)) {
    const anyFailed = finalProject.agentRuns.some((r) => r.status === "failed");
    await ProjectModel.updateOne(
      { _id: projectId },
      {
        $set: {
          status: anyFailed ? "failed" : "completed",
          generationCompletedAt: new Date(),
          lastError: anyFailed ? "One or more agents failed." : null,
        },
      },
    );
    logger.info(`[worker] workflow ${anyFailed ? "failed" : "completed"} for project ${projectId}`);
  }
}

/** Clear all generated content for a project before starting a new generation run. */
export async function clearGeneratedContent(projectId: string | Types.ObjectId): Promise<void> {
  await Promise.all([
    ProductionPlanModel.deleteMany({ project: projectId }),
    StoryModel.deleteMany({ project: projectId }),
    CharacterModel.deleteMany({ project: projectId }),
    ScreenplayModel.deleteMany({ project: projectId }),
    SceneModel.deleteMany({ project: projectId }),
  ]);
}
