import type { ProductionPlan } from "../../api/types";
import { ProvenanceBadge } from "../ProvenanceBadge";

export function PlanPanel({ plan }: { plan?: ProductionPlan }) {
  if (!plan) return <p className="muted">The Producer Agent has not produced a plan yet.</p>;
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{plan.workingTitle}</h2>
        <ProvenanceBadge provenance={plan.provenance} />
      </div>
      <p className="lead">{plan.logline}</p>
      <dl className="facts">
        <dt>Tone</dt>
        <dd>{plan.tone}</dd>
        <dt>Audience</dt>
        <dd>{plan.targetAudience}</dd>
        <dt>Visual style</dt>
        <dd>{plan.visualStyle}</dd>
        <dt>Themes</dt>
        <dd>{plan.themes.join(", ")}</dd>
        <dt>Scenes</dt>
        <dd>{plan.targetSceneCount}</dd>
      </dl>

      <h3>Creative tasks</h3>
      <div className="grid">
        {plan.creativeTasks.map((task) => (
          <div key={task.agent} className="subcard">
            <span className="eyebrow">{task.agent} agent</span>
            <strong>{task.title}</strong>
            <p>{task.brief}</p>
            {task.deliverables.length > 0 && (
              <ul className="tags">
                {task.deliverables.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {plan.productionNotes.length > 0 && (
        <>
          <h3>Production notes</h3>
          <ul>
            {plan.productionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
