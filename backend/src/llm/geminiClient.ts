import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { AgentName } from "../domain/types.js";
import { LlmError, type LlmClient, type StructuredRequest, type StructuredResult } from "./types.js";

export interface GeminiClientOptions {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
}

/**
 * Google Gemini implementation of the shared LLM client.
 *
 * - Structured output: the agent's Zod schema is converted to JSON Schema and sent as
 *   `responseJsonSchema` with `responseMimeType: "application/json"`, so Gemini returns JSON
 *   in that shape. The JSON is then validated against the same Zod schema before use.
 * - Transient failures (including free-tier 429 rate limits) are retried by the SDK.
 * - `response.modelVersion` records which model version actually answered.
 */
export class GeminiLlmClient implements LlmClient {
  readonly provider = "gemini" as const;
  readonly isMock = false;
  private readonly ai: GoogleGenAI;

  constructor(private readonly options: GeminiClientOptions) {
    this.ai = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: { timeout: 300_000, retryOptions: { attempts: 4 } },
    });
  }

  get model(): string {
    return this.options.model;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const label = `${request.agent} agent`;

    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.options.model,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: toResponseJsonSchema(request.schema),
          maxOutputTokens: this.options.maxOutputTokens,
        },
      });
    } catch (error) {
      throw toLlmError(error, request.agent, this.options.model);
    }

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new LlmError(`${label}: Gemini blocked the prompt (${blockReason}).`);
    }
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new LlmError(`${label}: response was truncated at LLM_MAX_TOKENS=${this.options.maxOutputTokens}. Increase it and retry.`);
    }
    if (finishReason && finishReason !== FinishReason.STOP) {
      throw new LlmError(`${label}: Gemini stopped generating early (${finishReason}).`);
    }

    const text = response.text;
    if (!text) throw new LlmError(`${label}: Gemini returned an empty response.`);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmError(`${label}: Gemini response was not valid JSON.`);
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new LlmError(`${label}: Gemini response did not match the expected output schema: ${z.prettifyError(parsed.error)}`);
    }

    return {
      data: parsed.data,
      provenance: {
        agent: request.agent,
        provider: "gemini",
        model: response.modelVersion ?? this.options.model,
        isMock: false,
        generatedAt: new Date(),
      },
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

/** Zod schema -> JSON Schema for `responseJsonSchema` (the `$schema` dialect marker is not needed). */
function toResponseJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return jsonSchema;
}

/** The API's human-readable `error.message` (ApiError.message carries the raw JSON error body). */
function apiErrorDetail(error: ApiError): string {
  let detail = error.message;
  const start = detail.indexOf("{");
  if (start !== -1) {
    try {
      const body = JSON.parse(detail.slice(start)) as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string") detail = body.error.message;
    } catch {
      // not JSON: keep the raw message
    }
  }
  return detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
}

/** Map Gemini API errors (by HTTP status) to user-safe messages. */
function toLlmError(error: unknown, agent: AgentName, model: string): LlmError {
  const label = `${agent} agent`;
  if (error instanceof ApiError) {
    const detail = apiErrorDetail(error);
    switch (error.status) {
      case 400:
        return new LlmError(`${label}: Gemini rejected the request (400): ${detail}`);
      case 401:
      case 403:
        return new LlmError(`${label}: Gemini rejected the API key (${error.status}). Check GEMINI_API_KEY.`);
      case 404:
        return new LlmError(`${label}: model "${model}" not found (404). Check LLM_MODEL.`);
      case 429:
        return new LlmError(`${label}: Gemini free-tier rate limit or daily quota reached (429). Wait and retry.`, true);
      default:
        if (error.status >= 500) {
          return new LlmError(`${label}: Gemini service error (${error.status}). Try again shortly.`, true);
        }
        return new LlmError(`${label}: Gemini API error (${error.status}): ${detail}`);
    }
  }
  return new LlmError(`${label}: could not complete the Gemini request: ${error instanceof Error ? error.message : String(error)}`, true);
}
