import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { CreateProjectForm } from "../components/CreateProjectForm";
import { ProjectList } from "../components/ProjectList";

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Asset reuse: passed from AssetLibraryPage via ?reuseAsset=<id>&reuseLabel=<label>
  const reuseAssetId = searchParams.get("reuseAsset");
  const reuseLabel = searchParams.get("reuseLabel");

  const load = useCallback(() => {
    api
      .listProjects()
      .then((p) => {
        setProjects(p);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="projects-layout">
      <section className="card">
        <h2>New production</h2>
        {reuseAssetId && reuseLabel && (
          <div className="alert alert-info">
            <strong>Context from asset library:</strong> {reuseLabel}
            <br />
            <span className="muted small">
              This asset will be included in the generation context. Create a project below to use it.
            </span>
          </div>
        )}
        <CreateProjectForm
          onCreated={(project) => {
            if (reuseAssetId) {
              // Start generation immediately with the reused asset
              api.startGeneration(project.id, [reuseAssetId])
                .then(() => navigate(`/projects/${project.id}`))
                .catch(() => navigate(`/projects/${project.id}`));
            } else {
              navigate(`/projects/${project.id}`);
            }
          }}
        />
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Productions</h2>
          <button className="btn btn-ghost" onClick={load}>
            Refresh
          </button>
        </div>
        {error && <p className="alert alert-danger">{error}</p>}
        {!projects && !error && <p className="muted">Loading…</p>}
        {projects && <ProjectList projects={projects} />}
      </section>
    </div>
  );
}
