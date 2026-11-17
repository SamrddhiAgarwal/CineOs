import { z } from "zod";
import { DELEGATE_AGENTS, type DelegateAgentName, type ProjectBrief } from "../domain/types.js";
import { section, type Agent } from "./agent.js";
import { mockProductionPlan } from "./mocks/producerMock.js";

/** Structured output contract for the Producer Agent. */
export const productionPlanSchema = z.object({
  workingTitle: z.string(),
  logline: z.string(),
  tone: z.string(),
  targetAudience: z.string(),
  visualStyle: z.string(),
  themes: z.array(z.string()),
  targetSceneCount: z.number(),
  creativeTasks: z.array(
    z.object({
      agent: z.enum(DELEGATE_AGENTS),
      title: z.string(),
      brief: z.string(),
      deliverables: z.array(z.string()),
    }),
  ),
  productionNotes: z.array(z.string()),
});
export type ProductionPlanOutput = z.infer<typeof productionPlanSchema>;

export interface ProducerInput {
  project: ProjectBrief;
  reusedContext?: Array<{ label: string; type: string; contextText: string }>;
}

export const MIN_SCENES = 3;
export const MAX_SCENES = 12;

const SYSTEM_PROMPT = `You are the Producer Agent of CineOS, an AI movie production studio. You receive a filmmaker's movie idea and turn it into the production plan the rest of the creative team executes.

Your team:
- Story Agent: develops the premise, logline, synopsis, setting and act structure.
- Character Agent: designs the principal cast, with personalities, motivations, backstories, arcs and relationships.
- Screenwriter Agent: writes the scene-by-scene screenplay breakdown with action and dialogue, using the story and cast.

Your plan sets the creative direction (working title, logline, tone, target audience, visual style, themes) and coordinates the team:
- Write exactly one creative task for each agent ("story", "character", "screenwriter"). Each brief tells that agent what this particular film needs from them, grounded in the idea, genre and runtime rather than generic instructions. List concrete deliverables.
- Choose targetSceneCount: the number of scenes the Screenwriter will write. Scale it with the runtime, between ${MIN_SCENES} and ${MAX_SCENES}.
- Add practical production notes: priorities, risks and constraints the team should keep in mind.

Stay faithful to the filmmaker's idea, genre and runtime.`;

function buildPrompt({ project, reusedContext }: ProducerInput): string {
  const parts = [
    "Create the production plan for this film.",
    section(
      "project",
      [
        `Title: ${project.title}`,
        `Genre: ${project.genre}`,
        `Runtime: ${project.durationMinutes} minutes`,
        `Idea: ${project.idea}`,
      ].join("\n"),
    ),
  ];
  if (reusedContext && reusedContext.length > 0) {
    parts.push(
      section(
        "reused_creative_assets",
        "The following assets from previous productions are available for creative reuse:\n\n" +
        reusedContext.map((c) => `[${c.type.toUpperCase()} — ${c.label}]\n${c.contextText}`).join("\n\n"),
      ),
    );
  }
  return parts.join("\n\n");
}

/** Ensure the plan is usable by the workflow regardless of minor model deviations. */
function normalize(plan: ProductionPlanOutput, project: ProjectBrief): ProductionPlanOutput {
  const targetSceneCount = Math.min(MAX_SCENES, Math.max(MIN_SCENES, Math.round(plan.targetSceneCount || 0)));

  // Keep one task per delegate agent, in workflow order; add a fallback brief for any the model omitted.
  const creativeTasks = DELEGATE_AGENTS.map((agent) => {
    const task = plan.creativeTasks.find((t) => t.agent === agent);
    return task ?? fallbackTask(agent, project);
  });

  return { ...plan, targetSceneCount, creativeTasks };
}

function fallbackTask(agent: DelegateAgentName, project: ProjectBrief): ProductionPlanOutput["creativeTasks"][number] {
  const what: Record<DelegateAgentName, string> = {
    story: "Develop the story foundation",
    character: "Design the principal cast",
    screenwriter: "Write the scene-by-scene screenplay",
  };
  return {
    agent,
    title: what[agent],
    brief: `${what[agent]} for "${project.title}", a ${project.durationMinutes}-minute ${project.genre} film.`,
    deliverables: [],
  };
}

export const producerAgent: Agent<ProducerInput, ProductionPlanOutput> = {
  name: "producer",
  responsibility: "Turns the movie idea into a structured production plan and coordinates the creative tasks.",
  async run(input, llm) {
    const result = await llm.generateStructured({
      agent: "producer",
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      schema: productionPlanSchema,
      mock: () => mockProductionPlan(input.project),
    });
    return { ...result, data: normalize(result.data, input.project) };
  },
};
