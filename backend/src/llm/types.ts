import type { z } from "zod";
import type { AgentName, LlmProviderName, Provenance } from "../domain/types.js";

/** A request for schema-validated JSON from an agent. */
export interface StructuredRequest<T> {
  agent: AgentName;
  /** The agent's role and rules. Stable per agent. */
  system: string;
  /** The task-specific input for this run. */
  prompt: string;
  /** Output contract. Real responses are constrained to it; mock responses are validated against it. */
  schema: z.ZodType<T>;
  /** Deterministic development output, used only when the client runs in mock mode. */
  mock: () => T;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredResult<T> {
  data: T;
  provenance: Provenance;
  usage: TokenUsage | null;
}

/** The single LLM abstraction every agent uses. Implementations: Google Gemini and deterministic mock. */
export interface LlmClient {
  readonly provider: LlmProviderName;
  readonly model: string | null;
  readonly isMock: boolean;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** An LLM failure with a message that is safe to store on the project and show in the UI. */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
