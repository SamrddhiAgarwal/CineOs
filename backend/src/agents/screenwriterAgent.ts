import { z } from "zod";
import type { ProjectBrief } from "../domain/types.js";
import { jsonSection, section, type Agent } from "./agent.js";
import type { CharacterOutput } from "./characterAgent.js";
import { mockScreenplay } from "./mocks/screenwriterMock.js";
import type { ProductionPlanOutput } from "./producerAgent.js";
import type { StoryOutput } from "./storyAgent.js";

/** Structured output contract for the Screenwriter Agent. */
export const screenplaySchema = z.object({
  title: z.string(),
  logline: z.string(),
  scenes: z.array(
    z.object({
      sceneNumber: z.number(),
      act: z.number(),
      heading: z.string(),
      location: z.string(),
      timeOfDay: z.string(),
      summary: z.string(),
      purpose: z.string(),
      characters: z.array(z.string()),
      action: z.string(),
      dialogue: z.array(
        z.object({
          character: z.string(),
          parenthetical: z.string(),
          line: z.string(),
        }),
      ),
      estimatedDurationMinutes: z.number(),
    }),
  ),
});
export type ScreenplayOutput = z.infer<typeof screenplaySchema>;
export type SceneOutput = ScreenplayOutput["scenes"][number];

export interface ScreenwriterInput {
  project: ProjectBrief;
  plan: ProductionPlanOutput;
  story: StoryOutput;
  characters: CharacterOutput[];
  brief: string;
  reusedContext?: Array<{ label: string; type: string; contextText: string }>;
}

const SYSTEM_PROMPT = `You are the Screenwriter Agent of CineOS, an AI movie production studio. You turn an approved story and cast into screenplay content: a scene-by-scene breakdown with action and dialogue.

For each scene provide:
- sceneNumber (starting at 1) and act (matching the story's act numbers).
- heading in standard screenplay format, e.g. "INT. LIGHTHOUSE KITCHEN - NIGHT", plus the location and timeOfDay separately.
- summary: what happens. purpose: why the scene matters to the story.
- characters: who appears, using the cast's exact names.
- action: present-tense action lines describing what the audience sees.
- dialogue: the scene's key exchanges in the characters' distinct voices. Use the cast's exact names; set parenthetical to "" when none is needed.
- estimatedDurationMinutes: screen time for the scene.

Write exactly the number of scenes requested. Together they must cover the whole story from opening to ending, and their durations should add up to roughly the target runtime.`;

function buildPrompt({ project, plan, story, characters, brief, reusedContext }: ScreenwriterInput): string {
  const parts = [
    `Write the screenplay breakdown for this film in exactly ${plan.targetSceneCount} scenes, totalling about ${project.durationMinutes} minutes.`,
    section("project", `Title: ${project.title}\nGenre: ${project.genre}\nRuntime: ${project.durationMinutes} minutes`),
    jsonSection("creative_direction", { tone: plan.tone, visualStyle: plan.visualStyle, themes: plan.themes }),
    jsonSection("story", {
      title: story.title,
      logline: story.logline,
      synopsis: story.synopsis,
      setting: story.setting,
      acts: story.acts,
      ending: story.ending,
    }),
    jsonSection(
      "cast",
      characters.map((c) => ({
        name: c.name,
        role: c.role,
        personality: c.personality,
        motivation: c.motivation,
        arc: c.arc,
      })),
    ),
    section("producer_brief", brief),
  ];
  if (reusedContext && reusedContext.length > 0) {
    parts.push(
      section(
        "reused_creative_assets",
        "The following assets from previous productions are available for reference or reuse:\n\n" +
        reusedContext.map((c) => `[${c.type.toUpperCase()} — ${c.label}]\n${c.contextText}`).join("\n\n"),
      ),
    );
  }
  return parts.join("\n\n");
}

/** Number scenes sequentially in the order written and keep durations sensible. */
function normalize(output: ScreenplayOutput): ScreenplayOutput {
  const scenes = output.scenes.map((scene, index) => ({
    ...scene,
    sceneNumber: index + 1,
    act: Math.max(1, Math.round(scene.act || 1)),
    estimatedDurationMinutes: Math.max(0.5, Math.round((scene.estimatedDurationMinutes || 1) * 10) / 10),
  }));
  return { ...output, scenes };
}

export const screenwriterAgent: Agent<ScreenwriterInput, ScreenplayOutput> = {
  name: "screenwriter",
  responsibility: "Uses the story and characters to create screenplay content, dialogue and scene breakdowns.",
  async run(input, llm) {
    const result = await llm.generateStructured({
      agent: "screenwriter",
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      schema: screenplaySchema,
      mock: () => mockScreenplay(input),
    });
    return { ...result, data: normalize(result.data) };
  },
};
