import { randomUUID } from "node:crypto";
import { CharacterModel } from "../models/Character.js";
import { ProductionPlanModel } from "../models/ProductionPlan.js";
import { ProjectModel, type ProjectDocument } from "../models/Project.js";
import { SceneModel } from "../models/Scene.js";
import { ScreenplayModel } from "../models/Screenplay.js";
import { StoryModel } from "../models/Story.js";
import { HttpError } from "../utils/httpError.js";
import type { CreateProjectInput } from "../http/validation.js";

export async function createProject(input: CreateProjectInput): Promise<ProjectDocument> {
  return ProjectModel.create({ ...input, status: "draft", agentRuns: [] });
}

export async function listProjects(): Promise<ProjectDocument[]> {
  return ProjectModel.find().sort({ createdAt: -1 }).limit(200);
}

export async function getProject(id: string): Promise<ProjectDocument> {
  const project = await ProjectModel.findById(id);
  if (!project) throw HttpError.notFound(`Project ${id} not found.`);
  return project;
}

export async function getProjectStatus(id: string) {
  const project = await getProject(id);
  return {
    projectId: project.id as string,
    status: project.status,
    agentRuns: project.agentRuns,
    llm: project.llm,
    generationStartedAt: project.generationStartedAt,
    generationCompletedAt: project.generationCompletedAt,
    lastError: project.lastError,
  };
}

function notGenerated(what: string, id: string): HttpError {
  return HttpError.notFound(`No ${what} has been generated for project ${id} yet.`);
}

export async function getProductionPlan(id: string) {
  await getProject(id);
  const plan = await ProductionPlanModel.findOne({ project: id });
  if (!plan) throw notGenerated("production plan", id);
  return plan;
}

export async function getStory(id: string) {
  await getProject(id);
  const story = await StoryModel.findOne({ project: id });
  if (!story) throw notGenerated("story", id);
  return story;
}

export async function getCharacters(id: string) {
  await getProject(id);
  const characters = await CharacterModel.find({ project: id }).sort({ order: 1 });
  if (characters.length === 0) throw notGenerated("characters", id);
  return characters;
}

export async function getScenes(id: string) {
  await getProject(id);
  const scenes = await SceneModel.find({ project: id }).sort({ sceneNumber: 1 });
  if (scenes.length === 0) throw notGenerated("scenes", id);
  return scenes;
}

/** Create a branch of an existing production. Returns the new project. */
export async function branchProject(id: string, branchName: string): Promise<ProjectDocument> {
  const source = await getProject(id);
  return ProjectModel.create({
    title: source.title,
    idea: source.idea,
    genre: source.genre,
    durationMinutes: source.durationMinutes,
    status: "draft",
    agentRuns: [],
    branchId: randomUUID(),
    branchName: branchName || `Branch of ${source.title}`,
    parentProjectId: source._id as unknown as null,
    reusedAssetIds: [],
  });
}

export async function getScreenplayWithScenes(id: string) {
  await getProject(id);
  const screenplay = await ScreenplayModel.findOne({ project: id });
  if (!screenplay) throw notGenerated("screenplay", id);
  const scenes = await SceneModel.find({ screenplay: screenplay._id }).sort({ sceneNumber: 1 });
  return { ...screenplay.toJSON(), scenes: scenes.map((s) => s.toJSON()) };
}
