"use client";

import { useEffect, useRef } from "react";

/**
 * Fires a proactive nudge when the user changes page. The server (Sonnet via the
 * claude_cli bridge) decides whether a nudge is worthwhile — it answers `{ skip }`
 * for redundant/low-value moments and rate-limits repeats — so this hook just
 * debounces navigation and forwards any returned message to `onMessage`.
 *
 * `active` should be `provider === "claude_cli" && proactiveEnabled`. While the
 * chat is mid-turn (`isLoading`) we hold off and re-fire once it settles.
 */
export function useProactive({
  pathname,
  active,
  isLoading,
  onMessage,
}: {
  pathname: string;
  active: boolean;
  isLoading: boolean;
  onMessage: (text: string) => void;
}) {
  const lastFiredPath = useRef<string | null>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!active || !pathname) return;
    if (lastFiredPath.current === pathname) return;
    // Don't interrupt an in-flight turn; isLoading is a dep, so this effect
    // re-runs (and fires) once the turn settles.
    if (isLoading) return;

    lastFiredPath.current = pathname;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch("/api/assistant/proactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d && typeof d.message === "string" && d.message.trim()) {
            onMessageRef.current(d.message.trim());
          }
        })
        .catch(() => {});
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname, active, isLoading]);
}
