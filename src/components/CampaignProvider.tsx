"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

export interface CampaignLite {
  id: number;
  name: string;
  status: string;
  channels: string;
}

interface CampaignContextValue {
  campaigns: CampaignLite[];
  /** null = "all campaigns" */
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  selected: CampaignLite | null;
  loading: boolean;
  refresh: () => void;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);
const STORAGE_KEY = "prospectai.selectedCampaign";

// Global, persistent campaign scope. The selected campaign is remembered across
// reloads and shared by the dashboard, Review, and the chat agent so there is a
// single source of truth for "the campaign you're working on".
export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [selectedId, setSelectedIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const setSelectedId = useCallback((id: number | null) => {
    setSelectedIdState(id);
    try {
      if (id == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      /* ignore storage errors (private mode, etc.) */
    }
  }, []);

  const refresh = useCallback(() => {
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        const list: CampaignLite[] = Array.isArray(rows)
          ? rows.map((c: Record<string, unknown>) => ({
              id: Number(c.id),
              name: String(c.name ?? "—"),
              status: String(c.status ?? "active"),
              channels: String(c.channels ?? "email"),
            }))
          : [];
        setCampaigns(list);
        // Drop a stored selection that no longer exists.
        setSelectedIdState((cur) =>
          cur != null && !list.some((c) => c.id === cur) ? null : cur
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelectedIdState(Number(raw));
    } catch {
      /* ignore */
    }
    refresh();
  }, [refresh]);

  const selected =
    selectedId == null ? null : campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <CampaignContext
      value={{ campaigns, selectedId, setSelectedId, selected, loading, refresh }}
    >
      {children}
    </CampaignContext>
  );
}

export function useCampaign() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaign must be used within CampaignProvider");
  return ctx;
}
