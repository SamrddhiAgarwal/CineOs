import { z } from "zod";
import type { ProjectBrief } from "../domain/types.js";
import { jsonSection, section, type Agent } from "./agent.js";
import { mockStory } from "./mocks/storyMock.js";
import type { ProductionPlanOutput } from "./producerAgent.js";

/** Structured output contract for the Story Agent. */
export const storySchema = z.object({
  title: z.string(),
  logline: z.string(),
  premise: z.string(),
  synopsis: z.string(),
  setting: z.string(),
  structure: z.string(),
  acts: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      summary: z.string(),
      keyEvents: z.array(z.string()),
    }),
  ),
  themes: z.array(z.string()),
  ending: z.string(),
});
export type StoryOutput = z.infer<typeof storySchema>;

export interface StoryInput {
  project: ProjectBrief;
  plan: ProductionPlanOutput;
  brief: string;
  reusedContext?: Array<{ label: string; type: string; contextText: string }>;
}

const SYSTEM_PROMPT = `You are the Story Agent of CineOS, an AI movie production studio. You develop the story foundation that the Character and Screenwriter agents build on.

Deliver:
- premise: the dramatic situation and central question, in two or three sentences.
- logline: one sentence.
- synopsis: the complete story from opening to ending, in three to five paragraphs separated by blank lines.
- setting: where and when the story takes place.
- structure: the narrative structure you chose (for example "Three-act structure").
- acts: the acts in order, numbered from 1, each with a summary and its key plot events.
- themes and ending: what the film is about and how it resolves.

Follow the Producer's creative direction and the brief you were given. Keep the story achievable within the stated runtime.`;

function buildPrompt({ project, plan, brief, reusedContext }: StoryInput): string {
  const parts = [
    "Develop the story for this film.",
    section(
      "project",
      `Title: ${project.title}\nGenre: ${project.genre}\nRuntime: ${project.durationMinutes} minutes\nIdea: ${project.idea}`,
    ),
    jsonSection("creative_direction", {
      workingTitle: plan.workingTitle,
      logline: plan.logline,
      tone: plan.tone,
      targetAudience: plan.targetAudience,
      themes: plan.themes,
    }),
    section("producer_brief", brief),
  ];
  if (reusedContext && reusedContext.length > 0) {
    parts.push(
      section(
        "reused_creative_assets",
        "The following assets from previous productions are available. Use them as creative inspiration or reuse them directly as instructed.\n\n" +
        reusedContext.map((c) => `[${c.type.toUpperCase()} — ${c.label}]\n${c.contextText}`).join("\n\n"),
      ),
    );
  }
  return parts.join("\n\n");
}

function normalize(story: StoryOutput): StoryOutput {
  const acts = [...story.acts]
    .sort((a, b) => a.number - b.number)
    .map((act, index) => ({ ...act, number: index + 1 }));
  return { ...story, acts };
}

export const storyAgent: Agent<StoryInput, StoryOutput> = {
  name: "story",
  responsibility: "Generates the premise, plot, synopsis and story structure.",
  async run(input, llm) {
    const result = await llm.generateStructured({
      agent: "story",
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      schema: storySchema,
      mock: () => mockStory(input),
    });
    return { ...result, data: normalize(result.data) };
  },
};
