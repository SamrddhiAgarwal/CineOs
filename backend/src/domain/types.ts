/** Shared domain vocabulary used by models, agents, the workflow and the API. */

export const GENRES = [
  "action",
  "adventure",
  "animation",
  "comedy",
  "crime",
  "documentary",
  "drama",
  "fantasy",
  "horror",
  "mystery",
  "romance",
  "sci-fi",
  "thriller",
  "western",
] as const;
export type Genre = (typeof GENRES)[number];

export const PROJECT_STATUSES = ["draft", "generating", "completed", "failed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** The four AI agents, in the order the production workflow runs them. */
export const AGENT_NAMES = ["producer", "story", "character", "screenwriter"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/** Agents the Producer delegates creative tasks to. */
export const DELEGATE_AGENTS = ["story", "character", "screenwriter"] as const;
export type DelegateAgentName = (typeof DELEGATE_AGENTS)[number];

export const AGENT_RUN_STATUSES = ["pending", "queued", "running", "completed", "failed", "skipped"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const CHARACTER_ROLES = ["protagonist", "antagonist", "supporting", "minor"] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];

/** The one real LLM provider, plus the deterministic development mock. */
export const LLM_PROVIDERS = ["gemini", "mock"] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

/** Where a piece of generated content came from. Mock output is never presented as AI output. */
export interface Provenance {
  agent: AgentName;
  provider: LlmProviderName;
  model: string | null;
  isMock: boolean;
  generatedAt: Date;
}

/** The user's brief that every agent receives. */
export interface ProjectBrief {
  title: string;
  idea: string;
  genre: Genre;
  durationMinutes: number;
}
