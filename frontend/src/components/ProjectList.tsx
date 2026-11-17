import { Link } from "react-router-dom";
import type { Project } from "../api/types";
import { StatusBadge } from "./StatusBadge";

export function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return <p className="muted">No productions yet. Create one to get started.</p>;
  }
  return (
    <ul className="project-list">
      {projects.map((p) => (
        <li key={p.id}>
          <Link to={`/projects/${p.id}`} className="project-item">
            <div className="project-item-main">
              <strong>{p.title}</strong>
              <span className="muted">
                {p.genre} · {p.durationMinutes} min · created {new Date(p.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="project-item-badges">
              {p.llm?.isMock && <span className="pill pill-mock">MOCK</span>}
              <StatusBadge status={p.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
