import type { Asset } from "../api/types";
import { useAssetVersions } from "../hooks/useAssets";

interface Props {
  asset: Asset;
  onSelect?: (v: Asset) => void;
  onBranch?: (v: Asset) => void;
}

export function VersionHistory({ asset, onSelect, onBranch }: Props) {
  const { versions, loading } = useAssetVersions(asset._id);

  return (
    <div className="version-history">
      <h4 className="version-history-title">
        Version history · {asset.projectTitle} · {asset.type}
        {asset.branchId !== "main" && <span className="branch-tag"> branch</span>}
      </h4>
      {loading && <p className="muted small">Loading…</p>}
      {!loading && versions.length === 0 && <p className="muted small">No versions recorded.</p>}
      <ul className="version-list">
        {versions.map((v) => (
          <li key={v._id} className={`version-item ${v._id === asset._id ? "version-current" : ""}`}>
            <span className="version-badge">v{v.version}</span>
            <span className="version-date">{new Date(v.createdAt).toLocaleString()}</span>
            <span className={`pill pill-${v.provenance.isMock ? "mock" : "gemini"}`}>
              {v.provenance.isMock ? "mock" : "gemini"}
            </span>
            {v.sourceAssetIds.length > 0 && (
              <span className="pill pill-reused" title={`Reused ${v.sourceAssetIds.length} asset(s) from other productions`}>
                reused context
              </span>
            )}
            <span className="version-actions">
              {onSelect && v._id !== asset._id && (
                <button className="btn-link" onClick={() => onSelect(v)}>view</button>
              )}
              {onBranch && (
                <button className="btn-link" onClick={() => onBranch(v)}>branch</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
