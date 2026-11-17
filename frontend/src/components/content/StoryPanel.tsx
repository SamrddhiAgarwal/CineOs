import type { Story } from "../../api/types";
import { ProvenanceBadge } from "../ProvenanceBadge";

export function StoryPanel({ story }: { story?: Story }) {
  if (!story) return <p className="muted">The Story Agent has not produced a story yet.</p>;
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{story.title}</h2>
        <ProvenanceBadge provenance={story.provenance} />
      </div>
      <p className="lead">{story.logline}</p>

      <h3>Premise</h3>
      <p>{story.premise}</p>

      <dl className="facts">
        <dt>Setting</dt>
        <dd>{story.setting}</dd>
        <dt>Structure</dt>
        <dd>{story.structure}</dd>
        <dt>Themes</dt>
        <dd>{story.themes.join(", ")}</dd>
      </dl>

      <h3>Synopsis</h3>
      {story.synopsis.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>{para}</p>
      ))}

      <h3>Structure</h3>
      <div className="grid">
        {story.acts.map((act) => (
          <div key={act.number} className="subcard">
            <span className="eyebrow">Act {act.number}</span>
            <strong>{act.title}</strong>
            <p>{act.summary}</p>
            <ul>
              {act.keyEvents.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h3>Ending</h3>
      <p>{story.ending}</p>
    </article>
  );
}
