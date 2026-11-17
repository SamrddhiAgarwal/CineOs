import { z } from "zod";
import { CHARACTER_ROLES, type ProjectBrief } from "../domain/types.js";
import { jsonSection, section, type Agent } from "./agent.js";
import { mockCharacters } from "./mocks/characterMock.js";
import type { ProductionPlanOutput } from "./producerAgent.js";
import type { StoryOutput } from "./storyAgent.js";

/** Structured output contract for the Character Agent. */
export const charactersSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.enum(CHARACTER_ROLES),
      age: z.string(),
      description: z.string(),
      personality: z.array(z.string()),
      motivation: z.string(),
      backstory: z.string(),
      arc: z.string(),
      relationships: z.array(
        z.object({
          character: z.string(),
          type: z.string(),
          description: z.string(),
        }),
      ),
    }),
  ),
});
export type CharactersOutput = z.infer<typeof charactersSchema>;
export type CharacterOutput = CharactersOutput["characters"][number];

export interface CharacterInput {
  project: ProjectBrief;
  plan: ProductionPlanOutput;
  /** Story output — available when story runs first (stage 1); omitted when running in parallel (stage 2). */
  story?: StoryOutput;
  brief: string;
  reusedContext?: Array<{ label: string; type: string; contextText: string }>;
}

const SYSTEM_PROMPT = `You are the Character Agent of CineOS, an AI movie production studio. You design the principal cast for a story the Story Agent has already written.

Deliver three to six characters, including exactly one protagonist. For each character give:
- name, role (protagonist, antagonist, supporting or minor) and age (a short description such as "late 30s").
- description: who they are and how they come across on screen.
- personality: a handful of defining traits.
- motivation: what they want and why.
- backstory: the history that shapes them.
- arc: how they change, or refuse to change, over the story.
- relationships: their key relationships with other characters in this cast, referring to them by their exact names.

Characters must serve the story's events and themes. Give them conflicting goals so the drama comes from who they are.`;

function buildPrompt({ project, plan, story, brief, reusedContext }: CharacterInput): string {
  const storySection = story
    ? jsonSection("story", {
        logline: story.logline,
        premise: story.premise,
        synopsis: story.synopsis,
        setting: story.setting,
        acts: story.acts,
        ending: story.ending,
      })
    : section("story_note", "Story is being written in parallel. Design characters that fit the genre, themes and tone described in the creative direction below.");

  const parts = [
    "Design the principal cast for this film.",
    section("project", `Title: ${project.title}\nGenre: ${project.genre}\nRuntime: ${project.durationMinutes} minutes`),
    jsonSection("creative_direction", { tone: plan.tone, themes: plan.themes, targetAudience: plan.targetAudience }),
    storySection,
    section("producer_brief", brief),
  ];
  if (reusedContext && reusedContext.length > 0) {
    parts.push(
      section(
        "reused_creative_assets",
        "The following assets from previous productions are available. You may reuse or adapt these characters directly.\n\n" +
        reusedContext.map((c) => `[${c.type.toUpperCase()} — ${c.label}]\n${c.contextText}`).join("\n\n"),
      ),
    );
  }
  return parts.join("\n\n");
}

/** Keep exactly one protagonist (listed first) and drop relationships to characters outside the cast. */
function normalize(output: CharactersOutput): CharactersOutput {
  let characters = [...output.characters];
  const protagonistIndex = characters.findIndex((c) => c.role === "protagonist");
  if (protagonistIndex > 0) {
    const [protagonist] = characters.splice(protagonistIndex, 1);
    characters.unshift(protagonist!);
  } else if (protagonistIndex === -1 && characters.length > 0) {
    characters[0] = { ...characters[0]!, role: "protagonist" };
  }
  characters = characters.map((c, i) => (i > 0 && c.role === "protagonist" ? { ...c, role: "supporting" } : c));

  const names = new Set(characters.map((c) => c.name));
  characters = characters.map((c) => ({
    ...c,
    relationships: c.relationships.filter((r) => names.has(r.character) && r.character !== c.name),
  }));
  return { characters };
}

export const characterAgent: Agent<CharacterInput, CharactersOutput> = {
  name: "character",
  responsibility: "Generates characters, motivations, personalities and relationships.",
  async run(input, llm) {
    const result = await llm.generateStructured({
      agent: "character",
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      schema: charactersSchema,
      mock: () => mockCharacters(input),
    });
    return { ...result, data: normalize(result.data) };
  },
};
