"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/LocaleProvider";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || retryAfter > 0) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/inicio");
        router.refresh();
      } else if (res.status === 429) {
        setRetryAfter(data.retryAfter || 60);
        setError(t("login.tooManyAttempts"));
      } else {
        setError(data.error || t("login.invalidCredentials"));
      }
    } catch {
      setError(t("login.connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-primary min-h-screen flex items-center justify-center px-4">
      {/* Ambient backdrop + top accent line */}
      <div className="nd-ambient" aria-hidden />
      <div className="fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent pointer-events-none" />

      <div className="relative w-full max-w-[380px] nd-enter">
        {/* Logo / Title */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border-light mb-5">
            <span className="w-2 h-2 rounded-full bg-accent nd-pulse" />
          </div>
          <h1
            className="nd-display text-[42px] mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            PROSPECT<span className="text-accent">AI</span>
          </h1>
          <p className="nd-label text-text-secondary inline-flex items-center gap-2">
            <span className="w-4 h-px bg-border-visible" />
            {t("login.title")}
            <span className="w-4 h-px bg-border-visible" />
          </p>
        </div>

        {/* Login Card */}
        <div className="nd-card rounded-[var(--radius-card)] px-8 py-8 nd-enter-scale shadow-[var(--shadow-lg)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username */}
            <div>
              <label className="nd-label block mb-3">{t("login.username")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent border-b border-border-light px-0 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted/60 focus:outline-none focus:border-text-primary transition-colors duration-150"
                placeholder=""
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label className="nd-label block mb-3">{t("login.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border-b border-border-light px-0 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted/60 focus:outline-none focus:border-text-primary transition-colors duration-150"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="border border-accent/30 rounded-lg px-4 py-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.06em] text-accent">
                  {error}
                </p>
              </div>
            )}

            {/* Rate limit countdown */}
            {retryAfter > 0 && (
              <div className="border border-warning/30 rounded-lg px-4 py-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.06em] text-warning">
                  {t("login.retryIn")} {Math.floor(retryAfter / 60)}:
                  {String(retryAfter % 60).padStart(2, "0")}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || retryAfter > 0}
              className="w-full inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.06em] transition-all cursor-pointer bg-accent text-white rounded-full hover:opacity-85 active:opacity-75 px-5 py-2.5 text-[12px] min-h-[44px] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="flex gap-[2px]">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-white animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                  {t("login.verifying")}
                </span>
              ) : (
                t("login.submit")
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
