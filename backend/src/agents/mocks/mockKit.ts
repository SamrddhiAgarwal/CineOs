import type { ProjectBrief } from "../../domain/types.js";

/** Prefix used on mock narrative text so it can never be mistaken for model output. */
export const MOCK_TAG = "[MOCK]";
export const MOCK_NOTICE =
  "MOCK DEVELOPMENT OUTPUT: generated deterministically without an LLM because no GEMINI_API_KEY is configured.";

/** FNV-1a 32-bit string hash. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type Rng = () => number;

/** mulberry32: small, fast, deterministic PRNG. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same brief (and salt) always yields the same RNG sequence. */
export function rngFor(brief: ProjectBrief, salt: string): Rng {
  return createRng(hashString(`${salt}|${brief.title}|${brief.genre}|${brief.durationMinutes}|${brief.idea}`));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() called with an empty list");
  return items[Math.floor(rng() * items.length)]!;
}

/** Pick `count` distinct items (deterministic Fisher-Yates prefix). */
export function pickMany<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** First sentence-ish fragment of the idea, for weaving the user's input into mock text. */
export function ideaFragment(idea: string, maxLength = 140): string {
  const clean = idea.replace(/\s+/g, " ").trim();
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return firstSentence.length > maxLength ? `${firstSentence.slice(0, maxLength - 1).trimEnd()}…` : firstSentence;
}

export const GENRE_TONES: Record<ProjectBrief["genre"], readonly string[]> = {
  action: ["kinetic and relentless", "gritty and propulsive"],
  adventure: ["sweeping and hopeful", "daring and wide-eyed"],
  animation: ["playful and heartfelt", "whimsical and warm"],
  comedy: ["dry and absurd", "warm and chaotic"],
  crime: ["tense and morally grey", "cool and calculated"],
  documentary: ["intimate and observational", "investigative and urgent"],
  drama: ["restrained and emotional", "raw and intimate"],
  fantasy: ["mythic and luminous", "dark and enchanted"],
  horror: ["dread-soaked and claustrophobic", "eerie and slow-burning"],
  mystery: ["atmospheric and puzzling", "quiet and unsettling"],
  romance: ["tender and bittersweet", "bright and yearning"],
  "sci-fi": ["cerebral and awe-struck", "cold and paranoid"],
  thriller: ["taut and paranoid", "breathless and sharp"],
  western: ["dusty and elegiac", "stark and lawless"],
};
