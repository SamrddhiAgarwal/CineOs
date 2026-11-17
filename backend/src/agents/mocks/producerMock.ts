import type { ProjectBrief } from "../../domain/types.js";
import type { ProductionPlanOutput } from "../producerAgent.js";
import { GENRE_TONES, MOCK_NOTICE, MOCK_TAG, ideaFragment, pick, pickMany, rngFor } from "./mockKit.js";

const AUDIENCES = [
  "Adults 18-45 who seek character-driven genre films",
  "Festival audiences and arthouse viewers",
  "Broad streaming audiences, 16+",
  "Families and younger viewers, 10+",
];

const VISUAL_STYLES = [
  "Naturalistic handheld camera, practical light, muted palette",
  "Locked-off symmetrical framing with saturated color blocks",
  "High-contrast chiaroscuro lighting, deep shadows",
  "Wide anamorphic landscapes contrasted with tight close-ups",
];

const THEMES = [
  "identity",
  "sacrifice",
  "trust",
  "ambition",
  "grief",
  "redemption",
  "freedom",
  "belonging",
  "truth versus comfort",
  "the cost of power",
];

export function mockProductionPlan(project: ProjectBrief): ProductionPlanOutput {
  const rng = rngFor(project, "producer");
  const tone = pick(rng, GENRE_TONES[project.genre]);
  const targetSceneCount = Math.min(12, Math.max(3, Math.round(project.durationMinutes / 10)));
  const idea = ideaFragment(project.idea);

  return {
    workingTitle: project.title,
    logline: `${MOCK_TAG} A ${tone} ${project.genre} film: ${idea}`,
    tone,
    targetAudience: pick(rng, AUDIENCES),
    visualStyle: pick(rng, VISUAL_STYLES),
    themes: pickMany(rng, THEMES, 3),
    targetSceneCount,
    creativeTasks: [
      {
        agent: "story",
        title: "Develop the story foundation",
        brief: `${MOCK_TAG} Shape "${idea}" into a ${tone} three-act ${project.genre} story that fits ${project.durationMinutes} minutes.`,
        deliverables: ["Premise", "Logline", "Synopsis", "Act structure", "Ending"],
      },
      {
        agent: "character",
        title: "Design the principal cast",
        brief: `${MOCK_TAG} Build a compact cast whose conflicting goals drive the ${project.genre} plot.`,
        deliverables: ["Protagonist", "Antagonist", "Supporting roles", "Relationship map"],
      },
      {
        agent: "screenwriter",
        title: "Write the scene breakdown",
        brief: `${MOCK_TAG} Break the story into ${targetSceneCount} scenes with headings, action and dialogue.`,
        deliverables: ["Scene headings", "Action lines", "Dialogue", "Scene timings"],
      },
    ],
    productionNotes: [
      MOCK_NOTICE,
      `Runtime target: ${project.durationMinutes} minutes across ${targetSceneCount} scenes.`,
    ],
  };
}
