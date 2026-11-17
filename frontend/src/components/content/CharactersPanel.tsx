import type { Character } from "../../api/types";
import { ProvenanceBadge } from "../ProvenanceBadge";

export function CharactersPanel({ characters }: { characters?: Character[] }) {
  if (!characters || characters.length === 0) {
    return <p className="muted">The Character Agent has not produced a cast yet.</p>;
  }
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>Cast ({characters.length})</h2>
        <ProvenanceBadge provenance={characters[0]!.provenance} />
      </div>
      <div className="grid">
        {characters.map((c) => (
          <div key={c.id} className="subcard">
            <span className="eyebrow">
              {c.role} · {c.age}
            </span>
            <strong>{c.name}</strong>
            <p>{c.description}</p>
            <ul className="tags">
              {c.personality.map((trait) => (
                <li key={trait}>{trait}</li>
              ))}
            </ul>
            <dl className="facts compact">
              <dt>Motivation</dt>
              <dd>{c.motivation}</dd>
              <dt>Backstory</dt>
              <dd>{c.backstory}</dd>
              <dt>Arc</dt>
              <dd>{c.arc}</dd>
            </dl>
            {c.relationships.length > 0 && (
              <>
                <span className="eyebrow">Relationships</span>
                <ul>
                  {c.relationships.map((r) => (
                    <li key={r.character}>
                      <strong>{r.character}</strong> ({r.type}): {r.description}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
