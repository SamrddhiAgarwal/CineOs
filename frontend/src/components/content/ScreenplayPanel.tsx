import type { Screenplay } from "../../api/types";
import { ProvenanceBadge } from "../ProvenanceBadge";

export function ScreenplayPanel({ screenplay }: { screenplay?: Screenplay }) {
  if (!screenplay) return <p className="muted">The Screenwriter Agent has not produced a screenplay yet.</p>;
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{screenplay.title}</h2>
        <ProvenanceBadge provenance={screenplay.provenance} />
      </div>
      <p className="lead">{screenplay.logline}</p>
      <p className="muted">
        {screenplay.sceneCount} scenes · approx. {screenplay.estimatedRuntimeMinutes} minutes
      </p>

      <div className="scenes">
        {screenplay.scenes.map((scene) => (
          <section key={scene.id} className="scene">
            <div className="scene-meta">
              <span className="eyebrow">
                Scene {scene.sceneNumber} · Act {scene.act} · {scene.estimatedDurationMinutes} min
              </span>
              <span className="muted small">{scene.characters.join(", ")}</span>
            </div>
            <h3 className="slugline">{scene.heading}</h3>
            <p className="muted small">
              <strong>Summary:</strong> {scene.summary} <strong>Purpose:</strong> {scene.purpose}
            </p>
            <div className="script">
              <p className="action">{scene.action}</p>
              {scene.dialogue.map((d, i) => (
                <div key={i} className="dialogue">
                  <div className="speaker">{d.character.toUpperCase()}</div>
                  {d.parenthetical && <div className="parenthetical">({d.parenthetical.replace(/^\(|\)$/g, "")})</div>}
                  <div className="line">{d.line}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
