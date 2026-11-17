import { setTimeout as sleep } from "node:timers/promises";
import { LlmError, type LlmClient, type StructuredRequest, type StructuredResult } from "./types.js";

/**
 * Deterministic development client used when no API key is configured.
 *
 * It never calls a model: it returns the agent's own deterministic mock builder output,
 * validated against the same schema real output must satisfy, and marks it `isMock: true`
 * so the API and UI always label it as MOCK.
 */
export class MockLlmClient implements LlmClient {
  readonly provider = "mock" as const;
  readonly model = null;
  readonly isMock = true;

  constructor(private readonly latencyMs: number) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (this.latencyMs > 0) await sleep(this.latencyMs);

    const result = request.schema.safeParse(request.mock());
    if (!result.success) {
      throw new LlmError(`${request.agent} agent: mock output does not satisfy its schema: ${result.error.message}`);
    }

    return {
      data: result.data,
      provenance: {
        agent: request.agent,
        provider: "mock",
        model: null,
        isMock: true,
        generatedAt: new Date(),
      },
      usage: null,
    };
  }
}
