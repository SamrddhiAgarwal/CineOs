/**
 * End-to-end smoke test against a running CineOS API.
 *
 *   npm run smoke                       # defaults to http://localhost:4000
 *   SMOKE_API_URL=http://host:port npm run smoke
 *
 * Verifies health/DB, validation, project persistence, the generation workflow, that every agent
 * produced structured content, and that provenance (Gemini vs MOCK) is reported consistently.
 */
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.SMOKE_API_URL ?? "http://localhost:4000";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15 * 60_000);

type Json = Record<string, any>;
let failures = 0;

function check(condition: unknown, label: string): void {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Json) : {} };
}

async function main(): Promise<void> {
  console.log(`CineOS smoke test against ${BASE}\n`);

  console.log("1. Health");
  const health = await call("GET", "/api/health");
  check(health.status === 200 && health.json.database === "connected", "API up and MongoDB connected");
  const expectMock: boolean = health.json.llm?.isMock;
  console.log(`  INFO  LLM mode: ${expectMock ? "MOCK" : `${health.json.llm?.provider} / ${health.json.llm?.model}`}`);

  console.log("\n2. Validation");
  const invalid = await call("POST", "/api/projects", { title: "", idea: "short", genre: "opera", durationMinutes: 0 });
  check(invalid.status === 400 && invalid.json.error?.code === "VALIDATION_ERROR", "invalid project rejected with 400");
  const badId = await call("GET", "/api/projects/not-an-id");
  check(badId.status === 400, "malformed project id rejected with 400");

  console.log("\n3. Project persistence");
  const created = await call("POST", "/api/projects", {
    title: "The Last Lighthouse",
    idea: "A reclusive lighthouse keeper discovers that the light she tends is the only thing keeping an ancient sea creature asleep, just as the town votes to decommission it.",
    genre: "fantasy",
    durationMinutes: 45,
  });
  check(created.status === 201 && typeof created.json.id === "string", "project created (201)");
  const id: string = created.json.id;
  const fetched = await call("GET", `/api/projects/${id}`);
  check(fetched.status === 200 && fetched.json.title === "The Last Lighthouse" && fetched.json.status === "draft", "project retrievable by id");
  const list = await call("GET", "/api/projects");
  check(Array.isArray(list.json) && list.json.some((p: Json) => p.id === id), "project appears in list");
  const early = await call("GET", `/api/projects/${id}/story`);
  check(early.status === 404, "story is 404 before generation");

  console.log("\n4. Generation workflow");
  const started = await call("POST", `/api/projects/${id}/generate`);
  check(started.status === 202 && started.json.status === "generating", "generation accepted (202)");
  const dup = await call("POST", `/api/projects/${id}/generate`);
  check(dup.status === 409, "concurrent generation rejected (409)");

  const deadline = Date.now() + TIMEOUT_MS;
  let status: Json = {};
  let lastLine = "";
  while (Date.now() < deadline) {
    status = (await call("GET", `/api/projects/${id}/status`)).json;
    const line = status.agentRuns.map((r: Json) => `${r.agent}:${r.status}`).join("  ");
    if (line !== lastLine) console.log(`  ....  ${line}`);
    lastLine = line;
    if (status.status !== "generating") break;
    await sleep(500);
  }
  check(status.status === "completed", `workflow completed (status=${status.status}${status.lastError ? `, error=${status.lastError}` : ""})`);
  check(status.agentRuns?.every((r: Json) => r.status === "completed"), "all four agents completed");

  console.log("\n5. Structured content");
  const plan = await call("GET", `/api/projects/${id}/plan`);
  check(plan.status === 200 && plan.json.creativeTasks?.length === 3 && plan.json.targetSceneCount >= 3, "production plan with 3 creative tasks");
  const story = await call("GET", `/api/projects/${id}/story`);
  check(story.status === 200 && story.json.acts?.length >= 1 && story.json.synopsis?.length > 0, "story with synopsis and acts");
  const chars = await call("GET", `/api/projects/${id}/characters`);
  check(chars.status === 200 && chars.json.length >= 1 && chars.json[0].role === "protagonist", "characters with protagonist first");
  const screenplay = await call("GET", `/api/projects/${id}/screenplay`);
  check(screenplay.status === 200 && screenplay.json.scenes?.length === screenplay.json.sceneCount, "screenplay with embedded scenes");
  const scenes = await call("GET", `/api/projects/${id}/scenes`);
  check(
    scenes.status === 200 && scenes.json.length > 0 && scenes.json.every((s: Json) => s.heading && Array.isArray(s.dialogue)),
    "scenes with headings and dialogue",
  );

  console.log("\n6. Provenance (real vs mock)");
  const docs: [string, Json][] = [
    ["producer", plan.json],
    ["story", story.json],
    ["character", chars.json[0] ?? {}],
    ["screenwriter", screenplay.json],
  ];
  for (const [agent, doc] of docs) {
    const p = doc.provenance ?? {};
    check(p.agent === agent && p.isMock === expectMock, `${agent}: provenance agent=${p.agent} provider=${p.provider} model=${p.model} isMock=${p.isMock}`);
  }

  console.log(`\nProject id: ${id}`);
  console.log(failures === 0 ? "\nSMOKE TEST PASSED" : `\nSMOKE TEST FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exit(1);
});
