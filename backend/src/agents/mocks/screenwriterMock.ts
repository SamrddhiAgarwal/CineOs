import type { ScreenplayOutput, ScreenwriterInput, SceneOutput } from "../screenwriterAgent.js";
import { MOCK_TAG, pick, rngFor } from "./mockKit.js";

const LOCATIONS: { place: string; interior: boolean }[] = [
  { place: "ABANDONED WAREHOUSE", interior: true },
  { place: "CITY ROOFTOP", interior: false },
  { place: "DINER", interior: true },
  { place: "HIGHWAY OVERPASS", interior: false },
  { place: "APARTMENT", interior: true },
  { place: "TRAIN PLATFORM", interior: false },
  { place: "POLICE PRECINCT", interior: true },
  { place: "FOREST CLEARING", interior: false },
];
const TIMES = ["DAY", "NIGHT", "DAWN", "DUSK"];

export function mockScreenplay({ project, plan, story, characters }: ScreenwriterInput): ScreenplayOutput {
  const rng = rngFor(project, "screenwriter");
  const sceneCount = plan.targetSceneCount;
  const actCount = Math.max(1, story.acts.length);
  const perScene = Math.round((project.durationMinutes / sceneCount) * 10) / 10;
  const names = characters.map((c) => c.name);
  const lead = names[0] ?? "PROTAGONIST";

  const scenes: SceneOutput[] = Array.from({ length: sceneCount }, (_, i) => {
    const act = Math.min(actCount, Math.floor((i / sceneCount) * actCount) + 1);
    const location = pick(rng, LOCATIONS);
    const timeOfDay = pick(rng, TIMES);
    const other = names.length > 1 ? names[1 + (i % (names.length - 1))]! : lead;
    const actTitle = story.acts[act - 1]?.title ?? `Act ${act}`;

    return {
      sceneNumber: i + 1,
      act,
      heading: `${location.interior ? "INT." : "EXT."} ${location.place} - ${timeOfDay}`,
      location: location.place,
      timeOfDay,
      summary: `${MOCK_TAG} ${actTitle}: ${lead} and ${other} collide over what comes next.`,
      purpose: `${MOCK_TAG} Advances act ${act} (${actTitle}).`,
      characters: other === lead ? [lead] : [lead, other],
      action: `${MOCK_TAG} ${lead} enters, scanning the ${location.place.toLowerCase()}. ${other} is already waiting.`,
      dialogue: [
        { character: lead, parenthetical: "", line: `${MOCK_TAG} We don't have much time.` },
        { character: other, parenthetical: "quietly", line: `${MOCK_TAG} Then tell me the truth.` },
        { character: lead, parenthetical: "", line: `${MOCK_TAG} Placeholder dialogue for scene ${i + 1}.` },
      ],
      estimatedDurationMinutes: perScene,
    };
  });

  return { title: story.title, logline: story.logline, scenes };
}
