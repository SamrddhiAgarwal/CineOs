import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { AudioMode, Health, MediaRender, RenderKind, Scene } from "../api/types";
import { useRenders } from "../hooks/useRenders";

const AUDIO_LABELS: Record<AudioMode, string> = {
  score: "Synthesised score (FFmpeg)",
  none: "No audio",
  library: "Project soundtrack file",
};

const FILM_LENGTHS = [30, 45, 60, 90];

function formatBytes(n: number): string {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

function label(r: MediaRender): string {
  return `${r.kind === "film" ? "Film" : "Trailer"} v${r.version}`;
}

function StatusPill({ render }: { render: MediaRender }) {
  const cls =
    render.status === "completed" ? "pill-ok" : render.status === "failed" ? "pill-danger" : render.status === "rendering" ? "pill-running" : "pill-neutral";
  return <span className={`pill ${cls}`}>{render.status}</span>;
}

export function MediaPanel({ projectId, scenes }: { projectId: string; scenes: Scene[] }) {
  const { renders, loading, error, submitting, lastEvent, requestRender } = useRenders(projectId);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<number[]>(() => scenes.map((s) => s.sceneNumber));
  const [filmSeconds, setFilmSeconds] = useState(45);
  const [audio, setAudio] = useState<AudioMode>("score");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    setSelected(scenes.map((s) => s.sceneNumber));
  }, [scenes]);

  const active = renders.filter((r) => r.status === "queued" || r.status === "rendering");
  const completed = renders.filter((r) => r.status === "completed" && r.output);
  const playing = useMemo(
    () => completed.find((r) => r.id === playingId) ?? completed[0] ?? null,
    [completed, playingId],
  );
  const ffmpegMissing = health !== null && !health.media.ffmpeg;

  const toggle = (n: number) =>
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));

  const start = async (kind: RenderKind) => {
    const render = await requestRender({
      kind,
      audio,
      sceneNumbers: selected.length === scenes.length ? undefined : selected,
      targetSeconds: kind === "film" ? filmSeconds : undefined,
    });
    if (render) setPlayingId(null);
  };

  const filmOf = (r: MediaRender) => renders.find((x) => x.id === r.sourceRenderId);

  return (
    <div className="media-panel">
      {ffmpegMissing && (
        <p className="alert alert-danger">
          FFmpeg is not installed on the server, so videos cannot be rendered. {health?.media.error}
        </p>
      )}

      <section className="media-controls">
        <div className="media-controls-head">
          <h3>Render from the screenplay</h3>
          <span className="muted small">
            Scenes are assembled by FFmpeg into an H.264/AAC MP4 on the render queue.
          </span>
        </div>

        <div className="scene-picker">
          {scenes.map((s) => (
            <label key={s.sceneNumber} className={`scene-chip ${selected.includes(s.sceneNumber) ? "scene-chip-on" : ""}`}>
              <input type="checkbox" checked={selected.includes(s.sceneNumber)} onChange={() => toggle(s.sceneNumber)} />
              <span className="scene-chip-num">{s.sceneNumber}</span>
              <span className="scene-chip-text">{s.heading}</span>
            </label>
          ))}
        </div>

        <div className="media-options">
          <label className="filter-label">
            Film length
            <select className="filter-select" value={filmSeconds} onChange={(e) => setFilmSeconds(Number(e.target.value))}>
              {FILM_LENGTHS.map((s) => (
                <option key={s} value={s}>
                  ~{s} seconds
                </option>
              ))}
            </select>
          </label>
          <label className="filter-label">
            Audio
            <select className="filter-select" value={audio} onChange={(e) => setAudio(e.target.value as AudioMode)}>
              {(Object.keys(AUDIO_LABELS) as AudioMode[]).map((m) => (
                <option key={m} value={m}>
                  {AUDIO_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <div className="media-actions">
            <button className="btn btn-primary" disabled={submitting || selected.length === 0 || ffmpegMissing} onClick={() => start("film")}>
              Render video
            </button>
            <button className="btn btn-secondary" disabled={submitting || selected.length === 0 || ffmpegMissing} onClick={() => start("trailer")}>
              Generate trailer
            </button>
          </div>
        </div>
        <p className="muted small">
          Trailers reuse the selected scenes (up to 6) and their scene visuals with shorter cuts and trailer titles.
          {audio === "library" && " “Project soundtrack” needs media/library/<projectId>/soundtrack.(mp3|m4a|wav…) on the server."}
        </p>
        {error && <p className="alert alert-danger">{error}</p>}
      </section>

      {active.map((r) => (
        <section key={r.id} className="render-progress">
          <div className="render-progress-head">
            <strong>{label(r)}</strong>
            <StatusPill render={r} />
            <span className="muted small">{r.stage}</span>
            {lastEvent[r.id] && <span className="pill pill-live">live · {lastEvent[r.id]}</span>}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${r.progress}%` }} />
          </div>
          <span className="muted small">{r.progress}%</span>
        </section>
      ))}

      {playing?.output && (
        <section className="player">
          <div className="player-head">
            <h3>
              {label(playing)} · {formatSeconds(playing.output.durationSeconds)}
            </h3>
            <a className="btn btn-secondary" href={api.renderDownloadUrl(playing.id)} download>
              Download MP4
            </a>
          </div>
          <video key={playing.output.url} className="video" src={playing.output.url} controls preload="metadata" playsInline />
          <p className="muted small">
            {playing.output.width}×{playing.output.height} · {playing.output.videoCodec} {playing.output.videoProfile ?? ""} ·{" "}
            {playing.output.pixelFormat} · {playing.output.hasAudio ? `${playing.output.audioCodec} audio` : "no audio track"} ·{" "}
            {formatBytes(playing.output.sizeBytes)} · fast start {playing.output.fastStart ? "yes" : "no"} · rendered in{" "}
            {playing.renderSeconds ?? "?"}s
          </p>
          <ul className="render-inputs">
            {playing.inputs.map((i) => (
              <li key={i.sceneNumber}>
                <strong>Scene {i.sceneNumber}</strong> · {i.durationSeconds}s · {i.visualSource === "library-image" ? "library image" : "generated scene card"}
                {i.visualReused && " (reused)"}
                {i.sceneAssetVersion !== null && <span className="muted"> · scene asset v{i.sceneAssetVersion}</span>}
                {i.note && <span className="muted"> · {i.note}</span>}
              </li>
            ))}
          </ul>
          {playing.audio.note && <p className="muted small">{playing.audio.note}</p>}
        </section>
      )}

      <section>
        <h3>Media history</h3>
        {loading && <p className="muted">Loading…</p>}
        {!loading && renders.length === 0 && <p className="muted">No videos rendered yet.</p>}
        {renders.length > 0 && (
          <table className="media-table">
            <thead>
              <tr>
                <th>Output</th>
                <th>Status</th>
                <th>Length</th>
                <th>Scenes</th>
                <th>Audio</th>
                <th>Requested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {renders.map((r) => (
                <tr key={r.id} className={playing?.id === r.id ? "media-row-active" : ""}>
                  <td>
                    {label(r)}
                    {r.kind === "trailer" && filmOf(r) && <div className="muted small">reuses visuals of {label(filmOf(r)!)}</div>}
                  </td>
                  <td>
                    <StatusPill render={r} />
                    {r.status === "failed" && r.error && <div className="render-error small">{r.error}</div>}
                  </td>
                  <td>{r.output ? formatSeconds(r.output.durationSeconds) : "—"}</td>
                  <td>{r.sceneNumbers.join(", ")}</td>
                  <td>{r.output ? (r.output.hasAudio ? r.audio.requested : "none") : r.audio.requested}</td>
                  <td className="muted small">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    {r.output && (
                      <div className="media-row-actions">
                        <button className="btn-link" onClick={() => setPlayingId(r.id)}>
                          play
                        </button>
                        <a className="btn-link" href={api.renderDownloadUrl(r.id)} download>
                          download
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
