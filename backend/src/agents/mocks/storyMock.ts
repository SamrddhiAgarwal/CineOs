import type { StoryInput, StoryOutput } from "../storyAgent.js";
import { MOCK_NOTICE, MOCK_TAG, ideaFragment, pick, rngFor } from "./mockKit.js";

const SETTINGS = [
  "A rain-soaked coastal city in the near future",
  "A remote mountain town cut off by winter",
  "A sprawling present-day metropolis",
  "An isolated research station",
  "A decaying frontier settlement",
];

export function mockStory({ project, plan }: StoryInput): StoryOutput {
  const rng = rngFor(project, "story");
  const idea = ideaFragment(project.idea);
  const setting = pick(rng, SETTINGS);

  return {
    title: plan.workingTitle,
    logline: plan.logline,
    premise: `${MOCK_TAG} ${idea} The story asks what the protagonist is willing to lose to see it through.`,
    synopsis: [
      MOCK_NOTICE,
      `${MOCK_TAG} In ${setting.toLowerCase()}, an ordinary life is upended: ${idea}`,
      `${MOCK_TAG} Pressure mounts as allies fracture and an opposing force closes in, forcing a choice between safety and ${plan.themes[0] ?? "truth"}.`,
      `${MOCK_TAG} In the final confrontation the protagonist pays a real price, and the world of the film is changed for good.`,
    ].join("\n\n"),
    setting,
    structure: "Three-act structure",
    acts: [
      {
        number: 1,
        title: "Setup",
        summary: `${MOCK_TAG} Establish the world, the protagonist and the inciting incident.`,
        keyEvents: ["Opening image", "Inciting incident", "Protagonist commits to the journey"],
      },
      {
        number: 2,
        title: "Confrontation",
        summary: `${MOCK_TAG} Obstacles escalate and alliances are tested.`,
        keyEvents: ["First reversal", "Midpoint revelation", "All is lost"],
      },
      {
        number: 3,
        title: "Resolution",
        summary: `${MOCK_TAG} The protagonist confronts the central conflict head-on.`,
        keyEvents: ["Climax", "Resolution", "Closing image"],
      },
    ],
    themes: plan.themes,
    ending: `${MOCK_TAG} A ${plan.tone} resolution that answers the central question.`,
  };
}
