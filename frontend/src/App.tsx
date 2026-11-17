import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { api } from "./api/client";
import type { Health } from "./api/types";
import { AssetLibraryPage } from "./pages/AssetLibraryPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          CineOS <span className="brand-sub">AI Movie Production Studio</span>
        </Link>
        <nav className="topbar-nav">
          <Link to="/" className="topbar-link">Productions</Link>
          <Link to="/assets" className="topbar-link">Asset Library</Link>
        </nav>
        <div className="topbar-status">
          {healthError && <span className="pill pill-danger">API unreachable</span>}
          {health && (
            <>
              <span className={`pill ${health.database === "connected" ? "pill-ok" : "pill-danger"}`}>
                MongoDB: {health.database}
              </span>
              {health.llm.isMock ? (
                <span className="pill pill-mock" title="No GEMINI_API_KEY configured: agents return deterministic mock output">
                  LLM: MOCK MODE
                </span>
              ) : (
                <span className="pill pill-ai">LLM: Gemini · {health.llm.model}</span>
              )}
            </>
          )}
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<WorkspacePage />} />
          <Route path="/assets" element={<AssetLibraryPage />} />
          <Route path="*" element={<p className="muted">Page not found. <Link to="/">Back to projects</Link></p>} />
        </Routes>
      </main>
    </div>
  );
}
