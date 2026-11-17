import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Asset, AssetType } from "../api/types";

export function useAllAssets(filters?: { type?: AssetType; genre?: string; projectId?: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await api.listAssets(filters));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [filters?.type, filters?.genre, filters?.projectId]);

  useEffect(() => { void load(); }, [load]);
  return { assets, loading, error, reload: load };
}

export function useAssetVersions(assetDbId: string | null) {
  const [versions, setVersions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetDbId) { setVersions([]); return; }
    setLoading(true);
    api.getAssetVersions(assetDbId)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [assetDbId]);

  return { versions, loading };
}

export function useProjectAssets(projectId: string | null) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try { setAssets(await api.getProjectAssets(projectId)); }
    catch { setAssets([]); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  return { assets, loading, reload: load };
}
