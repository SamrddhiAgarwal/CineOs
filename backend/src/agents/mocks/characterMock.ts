import type { CharacterRole } from "../../domain/types.js";
import type { CharacterInput, CharacterOutput, CharactersOutput } from "../characterAgent.js";
import { MOCK_TAG, pick, pickMany, rngFor } from "./mockKit.js";

const FIRST_NAMES = ["Mara", "Elias", "June", "Theo", "Ines", "Rafe", "Nadia", "Cole", "Wren", "Soren", "Lena", "Omar"];
const SURNAMES = ["Vance", "Okafor", "Hale", "Moreau", "Reyes", "Lindqvist", "Byrne", "Tanaka", "Castell", "Adeyemi"];
const TRAITS = [
  "stubborn",
  "observant",
  "charming",
  "guarded",
  "reckless",
  "loyal",
  "calculating",
  "idealistic",
  "sardonic",
  "compassionate",
  "ambitious",
  "anxious",
];
const AGES = ["early 20s", "late 20s", "mid 30s", "early 40s", "late 50s", "60s"];

const CAST: { role: CharacterRole; relationToLead: string }[] = [
  { role: "protagonist", relationToLead: "" },
  { role: "antagonist", relationToLead: "rival" },
  { role: "supporting", relationToLead: "ally" },
  { role: "supporting", relationToLead: "mentor" },
];

export function mockCharacters({ project, story }: CharacterInput): CharactersOutput {
  const fallbackSetting = "an unknown world";
  const fallbackTheme = "truth";
  const rng = rngFor(project, "character");
  const firstNames = pickMany(rng, FIRST_NAMES, CAST.length);
  const surnames = pickMany(rng, SURNAMES, CAST.length);
  const names = firstNames.map((first, i) => `${first} ${surnames[i]}`);
  const lead = names[0]!;

  const characters: CharacterOutput[] = CAST.map(({ role, relationToLead }, i) => {
    const name = names[i]!;
    const relationships =
      i === 0
        ? names.slice(1).map((other, j) => ({
            character: other,
            type: CAST[j + 1]!.relationToLead,
            description: `${MOCK_TAG} ${other} is ${lead.split(" ")[0]}'s ${CAST[j + 1]!.relationToLead}.`,
          }))
        : [
            {
              character: lead,
              type: relationToLead,
              description: `${MOCK_TAG} ${name.split(" ")[0]} acts as ${lead.split(" ")[0]}'s ${relationToLead}.`,
            },
          ];

    return {
      name,
      role,
      age: pick(rng, AGES),
      description: `${MOCK_TAG} A ${role} shaped by ${(story?.setting ?? fallbackSetting).toLowerCase()}.`,
      personality: pickMany(rng, TRAITS, 3),
      motivation: `${MOCK_TAG} ${role === "antagonist" ? "Wants to keep control at any cost" : "Wants to protect what matters to them"}.`,
      backstory: `${MOCK_TAG} Placeholder backstory for development mode.`,
      arc: `${MOCK_TAG} ${role === "protagonist" ? "Learns that " + (story?.themes[0] ?? fallbackTheme) + " demands sacrifice" : "Is forced to reveal their true allegiance"}.`,
      relationships,
    };
  });

  return { characters };
}
