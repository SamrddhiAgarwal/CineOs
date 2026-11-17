import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Asset, AssetType } from "../api/types";
import { VersionHistory } from "../components/VersionHistory";
import { useAllAssets } from "../hooks/useAssets";

const TYPE_LABELS: Record<AssetType, string> = {
  plan: "Production Plan",
  story: "Story",
  character: "Character",
  screenplay: "Screenplay",
  scene: "Scene",
};

function assetPreview(asset: Asset): string {
  const c = asset.content;
  switch (asset.type) {
    case "character": return `${c["name"]} · ${c["role"]} · ${c["age"]}`;
    case "story": return String(c["logline"] ?? c["title"] ?? "");
    case "plan": return String(c["logline"] ?? c["workingTitle"] ?? "");
    case "screenplay": return `${c["sceneCount"]} scenes · ${c["estimatedRuntimeMinutes"]} min`;
    case "scene": return `Scene ${c["sceneNumber"]}: ${String(c["heading"] ?? "").slice(0, 60)}`;
    default: return "";
  }
}

export function AssetLibraryPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<AssetType | "">("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [branching, setBranching] = useState(false);

  const { assets, loading, error, reload } = useAllAssets(typeFilter ? { type: typeFilter } : undefined);

  async function handleBranchAsset(asset: Asset) {
    setBranching(true);
    try {
      await api.branchAsset(asset._id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Branch failed");
    } finally {
      setBranching(false);
    }
  }

  async function handleReuse(asset: Asset) {
    // Navigate to projects page with this asset pre-selected for reuse
    navigate(`/?reuseAsset=${asset._id}&reuseLabel=${encodeURIComponent(`${asset.type}: ${assetPreview(asset)} (${asset.projectTitle})`)}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/" className="back-link">← All productions</Link>
          <h1>Asset Library</h1>
          <p className="muted">All versioned assets across every production.</p>
        </div>
      </div>

      <div className="filter-bar">
        <label className="filter-label">
          Type
          <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AssetType | "")}>
            <option value="">All types</option>
            {(Object.entries(TYPE_LABELS) as [AssetType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <span className="muted small">{assets.length} asset{assets.length !== 1 ? "s" : ""}</span>
      </div>

      {error && <p className="alert alert-danger">{error}</p>}
      {loading && <p className="muted">Loading assets…</p>}

      {!loading && assets.length === 0 && (
        <p className="muted">No assets yet. Generate a production to create assets.</p>
      )}

      <div className="asset-grid">
        {assets.map((asset) => (
          <div key={asset._id} className={`asset-card ${selectedAsset?._id === asset._id ? "asset-card-selected" : ""}`}>
            <div className="asset-card-header">
              <span className={`pill pill-type-${asset.type}`}>{TYPE_LABELS[asset.type]}</span>
              <span className="asset-version">v{asset.version}</span>
              {asset.branchId !== "main" && <span className="pill pill-branch">branch</span>}
              {asset.sourceAssetIds.length > 0 && (
                <span className="pill pill-reused" title="Generated with reused context from another production">↺ reused</span>
              )}
            </div>

            <div className="asset-card-body">
              <p className="asset-project">{asset.projectTitle} · {asset.projectGenre}</p>
              <p className="asset-preview">{assetPreview(asset)}</p>
              {asset.type === "character" && Array.isArray(asset.content["personality"]) && (
                <p className="asset-tags muted small">
                  {(asset.content["personality"] as string[]).slice(0, 3).join(" · ")}
                </p>
              )}
            </div>

            <div className="asset-card-footer">
              <span className="muted small">{new Date(asset.createdAt).toLocaleDateString()}</span>
              <div className="asset-actions">
                <button
                  className="btn-link"
                  onClick={() => setSelectedAsset(selectedAsset?._id === asset._id ? null : asset)}
                >
                  {selectedAsset?._id === asset._id ? "hide versions" : "versions"}
                </button>
                <button className="btn-link" onClick={() => handleBranchAsset(asset)} disabled={branching}>
                  branch
                </button>
                <button className="btn-link accent" onClick={() => handleReuse(asset)}>
                  reuse ↗
                </button>
              </div>
            </div>

            {selectedAsset?._id === asset._id && (
              <VersionHistory
                asset={asset}
                onSelect={setSelectedAsset}
                onBranch={handleBranchAsset}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
