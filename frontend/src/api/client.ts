import type {
  Asset,
  AssetType,
  BranchedProject,
  Character,
  CreateProjectInput,
  CreateRenderInput,
  Health,
  MediaRender,
  ProductionPlan,
  Project,
  ProjectStatusResponse,
  Screenplay,
  Story,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(res.status, error?.code ?? "HTTP_ERROR", error?.message ?? `Request failed (${res.status})`, error?.details);
  }
  return data as T;
}

export const api = {
  health: () => request<Health>("GET", "/health"),
  listProjects: () => request<Project[]>("GET", "/projects"),
  getProject: (id: string) => request<Project>("GET", `/projects/${id}`),
  createProject: (input: CreateProjectInput) => request<Project>("POST", "/projects", input),
  startGeneration: (id: string, reusedAssetIds?: string[]) =>
    request<{ projectId: string; status: string }>("POST", `/projects/${id}/generate`, reusedAssetIds?.length ? { reusedAssetIds } : undefined),
  branchProject: (id: string, branchName: string) =>
    request<BranchedProject>("POST", `/projects/${id}/branch`, { branchName }),
  getProjectAssets: (id: string) => request<Asset[]>("GET", `/projects/${id}/assets`),
  listAssets: (params?: { type?: AssetType; genre?: string; projectId?: string }) => {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as [string, string][]).toString() : "";
    return request<Asset[]>("GET", `/assets${qs}`);
  },
  getAsset: (id: string) => request<Asset>("GET", `/assets/${id}`),
  getAssetVersions: (id: string) => request<Asset[]>("GET", `/assets/${id}/versions`),
  branchAsset: (id: string) => request<Asset>("POST", `/assets/${id}/branch`, {}),
  findRelatedAssets: (genre: string, type: AssetType, excludeProjectId?: string) => {
    const qs = new URLSearchParams({ genre, type, ...(excludeProjectId ? { excludeProjectId } : {}) });
    return request<Asset[]>("GET", `/assets/related?${qs}`);
  },
  getStatus: (id: string) => request<ProjectStatusResponse>("GET", `/projects/${id}/status`),
  getPlan: (id: string) => request<ProductionPlan>("GET", `/projects/${id}/plan`),
  getStory: (id: string) => request<Story>("GET", `/projects/${id}/story`),
  getCharacters: (id: string) => request<Character[]>("GET", `/projects/${id}/characters`),
  getScreenplay: (id: string) => request<Screenplay>("GET", `/projects/${id}/screenplay`),
  createRender: (projectId: string, input: CreateRenderInput) => request<MediaRender>("POST", `/projects/${projectId}/renders`, input),
  listRenders: (projectId: string) => request<MediaRender[]>("GET", `/projects/${projectId}/renders`),
  getRender: (id: string) => request<MediaRender>("GET", `/renders/${id}`),
  renderDownloadUrl: (id: string) => `/api/renders/${id}/download`,
};
