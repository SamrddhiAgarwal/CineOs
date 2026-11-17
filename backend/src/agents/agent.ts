import type { AgentName } from "../domain/types.js";
import type { LlmClient, StructuredResult } from "../llm/index.js";

/**
 * Contract shared by all CineOS agents.
 *
 * Each agent owns: a distinct responsibility, its own system prompt, a typed input,
 * a Zod output schema (the structured output contract) and a deterministic mock builder.
 * All agents call the model through the one shared {@link LlmClient}.
 */
export interface Agent<Input, Output> {
  readonly name: AgentName;
  readonly responsibility: string;
  run(input: Input, llm: LlmClient): Promise<StructuredResult<Output>>;
}

/** Render a labelled block for prompts, e.g. <story>…</story>. */
export function section(tag: string, body: string): string {
  return `<${tag}>\n${body.trim()}\n</${tag}>`;
}

/** Render a value as indented JSON inside a labelled block. */
export function jsonSection(tag: string, value: unknown): string {
  return section(tag, JSON.stringify(value, null, 2));
}
