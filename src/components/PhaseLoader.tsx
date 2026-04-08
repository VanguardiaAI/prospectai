"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";

type Phase = "search" | "analysis" | "generation" | "sending" | "engagement";

interface PhaseData {
  analysis?: { pending?: number; analyzed?: number };
  generation?: { emailDrafts?: number; waDrafts?: number };
  sending?: { sent?: number; approved?: number };
  engagement?: { replied?: number };
}

interface CampaignPhasesResponse {
  id: number;
  phases: PhaseData;
}

const SEGMENTS = 12;

function computeProcessed(
  phase: Phase,
  total: number,
  initialSnapshot: PhaseData | null,
  current: PhaseData | null
): number {
  if (!current || total === 0) return 0;

  switch (phase) {
    case "analysis": {
      // processed = total - current pending (pending decreases as items are processed)
      const pending = current.analysis?.pending ?? 0;
      return Math.max(0, total - pending);
    }
    case "generation": {
      // processed = new drafts created since start
      const currentDrafts = (current.generation?.emailDrafts ?? 0) + (current.generation?.waDrafts ?? 0);
      const initialDrafts = initialSnapshot
        ? (initialSnapshot.generation?.emailDrafts ?? 0) + (initialSnapshot.generation?.waDrafts ?? 0)
        : 0;
      return Math.max(0, currentDrafts - initialDrafts);
    }
    case "sending": {
      // processed = new sent since start
      const currentSent = current.sending?.sent ?? 0;
      const initialSent = initialSnapshot?.sending?.sent ?? 0;
      return Math.max(0, currentSent - initialSent);
    }
    case "engagement": {
      // For engagement, just use total - we can't easily track individual steps
      // If sequences finished, the enrollment count drops
      return 0; // Will use indeterminate-like behavior
    }
    default:
      return 0;
  }
}

// ─── Segmented Progress Bar ─────────────────────────────────────────

function SegmentedBar({ progress, indeterminate }: { progress: number; indeterminate?: boolean }) {
  const filled = indeterminate ? 0 : Math.round(progress * SEGMENTS);
  const [scanIndex, setScanIndex] = useState(0);

  useEffect(() => {
    if (!indeterminate) return;
    const interval = setInterval(() => {
      setScanIndex((i) => (i + 1) % (SEGMENTS + 3));
    }, 180);
    return () => clearInterval(interval);
  }, [indeterminate]);

  return (
    <div className="flex gap-[2px] w-[180px]">
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const isActive = indeterminate
          ? i >= scanIndex - 2 && i <= scanIndex
          : i < filled;

        return (
          <div
            key={i}
            className={clsx(
              "flex-1 h-[4px] transition-all duration-300",
              isActive ? "bg-accent" : "bg-muted/15"
            )}
          />
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function PhaseLoader({
  phase,
  campaignId,
  total,
  visible,
  onComplete,
}: {
  phase: Phase;
  campaignId: number;
  total: number;
  visible: boolean;
  onComplete?: () => void;
}) {
  const { t } = useT();
  const [processed, setProcessed] = useState(0);
  const initialSnapshotRef = useRef<PhaseData | null>(null);
  const completeFiredRef = useRef(false);
  const pollCountRef = useRef(0);
  const isIndeterminate = phase === "search" || phase === "engagement" || total === 0;

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/phases");
      if (!res.ok) return;
      const campaigns: CampaignPhasesResponse[] = await res.json();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      // Capture initial snapshot on first poll
      if (!initialSnapshotRef.current) {
        initialSnapshotRef.current = campaign.phases;
      }

      const count = computeProcessed(phase, total, initialSnapshotRef.current, campaign.phases);
      setProcessed(count);
      pollCountRef.current++;

      // Detect completion for determinate phases
      if (!isIndeterminate && total > 0 && count >= total && !completeFiredRef.current) {
        completeFiredRef.current = true;
        onComplete?.();
      }

      // For indeterminate phases (total=0), auto-complete after ~8s of polling (4 polls)
      if (isIndeterminate && pollCountRef.current >= 4 && !completeFiredRef.current) {
        completeFiredRef.current = true;
        onComplete?.();
      }
    } catch {
      // ignore polling errors
    }
  }, [campaignId, phase, total, isIndeterminate, onComplete]);

  useEffect(() => {
    if (!visible) {
      setProcessed(0);
      initialSnapshotRef.current = null;
      completeFiredRef.current = false;
      pollCountRef.current = 0;
      return;
    }

    // Poll immediately, then every 2s
    pollProgress();
    const interval = setInterval(pollProgress, 2000);

    // Auto-complete after timeout (safety net — 5 min max)
    const timeout = setTimeout(() => {
      if (!completeFiredRef.current) {
        completeFiredRef.current = true;
        onComplete?.();
      }
    }, 300_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [visible, pollProgress, onComplete]);

  if (!visible) return null;

  const progress = total > 0 ? Math.min(processed / total, 1) : 0;
  const label = t(`shortcuts.progress.${phase}`) || phase;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg/80 backdrop-blur-sm rounded-xl gap-3">
      <SegmentedBar progress={progress} indeterminate={isIndeterminate} />

      <span className="text-[10px] font-mono uppercase tracking-wide text-muted">
        {label}
      </span>

      {!isIndeterminate && total > 0 && (
        <span className="text-[13px] font-mono text-accent tabular-nums">
          {processed} / {total}
        </span>
      )}
    </div>
  );
}
