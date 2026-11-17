import { useState } from "react";

interface Props {
  projectTitle: string;
  onConfirm: (branchName: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function BranchModal({ projectTitle, onConfirm, onCancel, loading }: Props) {
  const [name, setName] = useState(`Branch of ${projectTitle}`);

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>Branch production</h3>
        <p className="muted">
          Creates a new production based on <strong>{projectTitle}</strong>. The branch starts empty — you
          generate new content from it, optionally reusing assets from the parent.
        </p>
        <label className="field-label">
          Branch name
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)} disabled={loading || !name.trim()}>
            {loading ? "Creating…" : "Create branch"}
          </button>
        </div>
      </div>
    </div>
  );
}
