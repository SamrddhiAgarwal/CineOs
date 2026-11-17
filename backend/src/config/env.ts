import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { LlmProviderName } from "../domain/types.js";

// backend/src/config (tsx) and backend/dist/config (built) are both three levels below the repo root.
const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");

const envFile = path.join(REPO_ROOT, ".env");
if (fs.existsSync(envFile)) {
  // Values already present in the process environment take precedence over the file.
  process.loadEnvFile(envFile);
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27018/cineos"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  LLM_MODE: z.enum(["auto", "gemini", "mock"]).default("auto"),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().min(1).default("gemini-4-hydrogen"),
  LLM_MAX_TOKENS: z.coerce.number().int().min(1024).max(65536).default(16000),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).max(60000).default(800),
  MEDIA_ROOT: z.string().min(1).optional(),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  RENDER_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),
});

// Treat empty strings (e.g. `GEMINI_API_KEY=`) as unset so defaults apply.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ""),
);

const parsed = EnvSchema.safeParse(rawEnv);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}
const env = parsed.data;

function resolveLlmProvider(): LlmProviderName {
  if (env.LLM_MODE === "mock") return "mock";
  if (env.LLM_MODE === "gemini") {
    if (!env.GEMINI_API_KEY) {
      throw new Error("LLM_MODE=gemini requires GEMINI_API_KEY to be set.");
    }
    return "gemini";
  }
  return env.GEMINI_API_KEY ? "gemini" : "mock";
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  mongoUri: env.MONGODB_URI,
  redisUrl: env.REDIS_URL,
  workerConcurrency: env.WORKER_CONCURRENCY,
  llm: {
    provider: resolveLlmProvider(),
    apiKey: env.GEMINI_API_KEY,
    model: env.LLM_MODEL,
    maxTokens: env.LLM_MAX_TOKENS,
    mockLatencyMs: env.MOCK_LATENCY_MS,
  },
  frontendDistDir: path.join(REPO_ROOT, "frontend", "dist"),
  media: {
    root: path.resolve(env.MEDIA_ROOT ?? path.join(REPO_ROOT, "media")),
    ffmpegPath: env.FFMPEG_PATH,
    ffprobePath: env.FFPROBE_PATH,
    renderConcurrency: env.RENDER_CONCURRENCY,
    renderTimeoutMs: env.RENDER_TIMEOUT_SECONDS * 1000,
  },
} as const;

export type AppConfig = typeof config;
