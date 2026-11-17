import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api/client";
import { GENRES, type Genre, type Project } from "../api/types";

interface Props {
  onCreated: (project: Project) => void;
}

export function CreateProjectForm({ onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState<Genre>("drama");
  const [duration, setDuration] = useState("90");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject({
        title: title.trim(),
        idea: idea.trim(),
        genre,
        durationMinutes: Number(duration),
      });
      onCreated(project);
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) {
        setError(e.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join(" · "));
      } else {
        setError(e instanceof Error ? e.message : "Could not create the project.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="The Last Lighthouse" />
      </label>
      <label>
        Movie idea
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          minLength={10}
          maxLength={4000}
          rows={5}
          required
          placeholder="A reclusive lighthouse keeper discovers the light she tends keeps an ancient sea creature asleep…"
        />
      </label>
      <div className="form-row">
        <label>
          Genre
          <select value={genre} onChange={(e) => setGenre(e.target.value as Genre)}>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duration (minutes)
          <input type="number" min={1} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} required />
        </label>
      </div>
      {error && <p className="alert alert-danger">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create production"}
      </button>
    </form>
  );
}
