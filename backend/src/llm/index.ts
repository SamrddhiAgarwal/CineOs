import type { AppConfig } from "../config/env.js";
import { GeminiLlmClient } from "./geminiClient.js";
import { MockLlmClient } from "./mockClient.js";
import type { LlmClient } from "./types.js";

export type { LlmClient, StructuredRequest, StructuredResult } from "./types.js";
export { LlmError } from "./types.js";

/** Build the one LLM client shared by all agents, based on configuration. */
export function createLlmClient(llmConfig: AppConfig["llm"]): LlmClient {
  if (llmConfig.provider === "gemini") {
    if (!llmConfig.apiKey) throw new Error("GEMINI_API_KEY is required for the gemini provider.");
    return new GeminiLlmClient({
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      maxOutputTokens: llmConfig.maxTokens,
    });
  }
  return new MockLlmClient(llmConfig.mockLatencyMs);
}
