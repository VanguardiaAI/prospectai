"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, Button, Input, Select, EmptyState, Spinner, Badge } from "@/components/ui";
import { useT } from "@/i18n/LocaleProvider";
import { Search, MapPin, Star, Globe, Check, Clock, ExternalLink } from "lucide-react";

interface Campaign {
  id: number;
  name: string;
}

interface SearchJob {
  id: number;
  scraperJobId: string | null;
  keyword: string;
  campaignId: number | null;
  status: string;
  resultCount: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PlaceResult {
  title?: string;
  category?: string;
  phone?: string;
  website?: string;
  address?: string;
  complete_address?: string;
  link?: string;
  review_count?: string;
  review_rating?: string;
  emails?: string;
}

interface JobWithResults extends SearchJob {
  results: PlaceResult[] | null;
}

export default function SearchPage() {
  const { t } = useT();
  const [keyword, setKeyword] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [maxDepth, setMaxDepth] = useState(5);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active job tracking
  const [activeJob, setActiveJob] = useState<JobWithResults | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Results selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Filters for results
  const [filterRating, setFilterRating] = useState("all");
  const [filterWebsite, setFilterWebsite] = useState("all");
  const [filterEmail, setFilterEmail] = useState("all");

  // Job history
  const [history, setHistory] = useState<SearchJob[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.json()).then(setCampaigns);
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const res = await fetch("/api/search");
    const data = await res.json();
    setHistory(data.jobs || []);
  };

  const startSearch = async () => {
    if (!keyword.trim()) return;
    setSubmitting(true);
    setError(null);
    setImportResult(null);
    setActiveJob(null);
    setSelected(new Set());

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          campaignId: campaignId || null,
          maxDepth,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("search.errorStarting"));
        setSubmitting(false);
        return;
      }

      // Start polling for results
      setActiveJob({ ...data.job, results: null });
      startPolling(data.job.id);
      setSubmitting(false);
    } catch {
      setError(t("search.connectionError"));
      setSubmitting(false);
    }
  };

  const startPolling = useCallback((jobId: number) => {
    setPolling(true);

    // Clear any existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`/api/search/${jobId}`);
        const data = await res.json();
        const job: JobWithResults = data.job;

        setActiveJob(job);

        if (job.status === "completed" || job.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);
          fetchHistory();

          // Auto-select all results
          if (job.results) {
            setSelected(new Set(job.results.map((_, i) => i)));
          }
        }
      } catch {
        // Silently retry on network errors
      }
    };

    // Poll immediately, then every 3 seconds
    poll();
    pollRef.current = setInterval(poll, 3000);
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!activeJob?.results) return;
    const filteredIndices = filteredWithIndex.map((f) => f.originalIndex);
    const allFilteredSelected = filteredIndices.every((i) => selected.has(i));
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIndices.forEach((i) => next.delete(i));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIndices.forEach((i) => next.add(i));
        return next;
      });
    }
  };

  const importSelected = async () => {
    if (!activeJob || selected.size === 0) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch(`/api/search/${activeJob.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedIndices: Array.from(selected),
          campaignId: campaignId || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setImportResult(t("search.importResult", { imported: data.imported, blacklist: data.skippedBlacklist, noName: data.skippedNoName }));
      } else {
        setImportResult(`Error: ${data.error}`);
      }
    } catch {
      setImportResult(t("search.importConnectionError"));
    }

    setImporting(false);
  };

  const loadJob = async (job: SearchJob) => {
    setShowHistory(false);
    setImportResult(null);
    setSelected(new Set());

    if (job.status === "completed") {
      const res = await fetch(`/api/search/${job.id}`);
      const data = await res.json();
      setActiveJob(data.job);
      if (data.job.results) {
        setSelected(new Set(data.job.results.map((_: PlaceResult, i: number) => i)));
      }
    } else if (job.status === "pending" || job.status === "running") {
      setActiveJob({ ...job, results: null } as JobWithResults);
      startPolling(job.id);
    } else {
      setActiveJob({ ...job, results: null } as JobWithResults);
    }
  };

  const allResults = activeJob?.results || [];

  // Apply client-side filters
  const filteredResults = allResults.filter((place) => {
    // Rating filter
    if (filterRating !== "all") {
      const rating = parseFloat(place.review_rating || "0");
      const minRating = parseFloat(filterRating);
      if (rating < minRating) return false;
    }
    // Website filter
    if (filterWebsite === "with" && !place.website) return false;
    if (filterWebsite === "without" && place.website) return false;
    // Email filter
    if (filterEmail !== "all") {
      const hasEmailValue = (() => {
        if (!place.emails || place.emails === "[]") return false;
        try { const arr = JSON.parse(place.emails); return arr.length > 0 && !!arr[0]; } catch { return place.emails.includes("@"); }
      })();
      if (filterEmail === "with" && !hasEmailValue) return false;
      if (filterEmail === "without" && hasEmailValue) return false;
    }
    return true;
  });

  // Map filtered results back to their original indices for selection tracking
  const filteredWithIndex = filteredResults.map((place) => ({
    place,
    originalIndex: allResults.indexOf(place),
  }));

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("search.title")}</h1>
          <p className="nd-label mt-2">{t("search.subtitle")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowHistory(!showHistory)}>
          <Clock className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
          {t("search.history")} ({history.length})
        </Button>
      </div>

      {/* Search Form */}
      <div className="nd-section">
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[280px]">
              <label className="nd-label block mb-2">{t("search.searchLabel")}</label>
              <div className="relative">
                <Search className="absolute left-0 top-2.5 h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
                <Input
                  className="pl-5"
                  placeholder={t("search.searchPlaceholder")}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !submitting && startSearch()}
                />
              </div>
            </div>
            <div className="w-40">
              <label className="nd-label block mb-2">{t("search.campaign")}</label>
              <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">{t("search.noCampaign")}</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <label className="nd-label block mb-2">{t("search.depth")}</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
              />
            </div>
            <Button size="sm" onClick={startSearch} disabled={submitting || !keyword.trim()}>
              {submitting ? t("common.searching") : t("search.search")}
            </Button>
          </div>

          {error && (
            <p className="text-[11px] font-mono text-accent mt-4">{t("common.error")} {error}</p>
          )}
        </Card>
      </div>

      {/* History dropdown */}
      {showHistory && history.length > 0 && (
        <div className="nd-section">
          <Card>
            <div className="space-y-2">
              <span className="nd-label">{t("search.previousSearches")}</span>
              {history.map((job) => (
                <button
                  key={job.id}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-left"
                  onClick={() => loadJob(job)}
                >
                  <div className="flex items-center gap-3">
                    <Search className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
                    <span className="text-sm text-text-primary">{job.keyword}</span>
                    <Badge color={job.status === "completed" ? "success" : job.status === "failed" ? "default" : "info"}>
                      {job.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-text-muted">{job.resultCount} {t("common.results")}</span>
                    <span className="text-[10px] font-mono text-text-muted">{job.createdAt}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Active Job Progress */}
      {activeJob && polling && (
        <div className="nd-section">
          <Card>
            <div className="flex items-center gap-4">
              <Spinner size="sm" />
              <div>
                <p className="text-sm text-text-primary">
                  {t("search.searchingLabel")} <span className="text-text-display font-medium">{activeJob.keyword}</span>
                </p>
                <p className="text-[10px] font-mono text-text-muted mt-1 uppercase tracking-wider">
                  {t("search.statusLabel")} {activeJob.status} {activeJob.resultCount > 0 && `| ${activeJob.resultCount} ${t("search.resultsFound")}`}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Failed job */}
      {activeJob?.status === "failed" && (
        <div className="nd-section">
          <Card>
            <div className="border border-accent/30 rounded-lg px-4 py-3 bg-accent-subtle">
              <span className="text-[10px] font-mono uppercase tracking-wider text-accent">{t("common.error")} </span>
              <span className="text-sm text-text-secondary">{activeJob.error || t("search.unknownError")}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Results */}
      {activeJob?.status === "completed" && allResults.length > 0 && (
        <div className="nd-section">
          {/* Filter controls */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="w-32">
              <label className="nd-label block mb-2">{t("search.ratingMin")}</label>
              <Select value={filterRating} onChange={(e) => setFilterRating(e.target.value)}>
                <option value="all">{t("common.all")}</option>
                <option value="3">{t("search.threePlus")}</option>
                <option value="3.5">{t("search.threeHalfPlus")}</option>
                <option value="4">{t("search.fourPlus")}</option>
                <option value="4.5">{t("search.fourHalfPlus")}</option>
              </Select>
            </div>
            <div className="w-32">
              <label className="nd-label block mb-2">{t("search.web")}</label>
              <Select value={filterWebsite} onChange={(e) => setFilterWebsite(e.target.value)}>
                <option value="all">{t("common.all")}</option>
                <option value="with">{t("search.withWeb")}</option>
                <option value="without">{t("search.withoutWeb")}</option>
              </Select>
            </div>
            <div className="w-32">
              <label className="nd-label block mb-2">{t("common.email")}</label>
              <Select value={filterEmail} onChange={(e) => setFilterEmail(e.target.value)}>
                <option value="all">{t("common.all")}</option>
                <option value="with">{t("search.withEmail")}</option>
                <option value="without">{t("search.withoutEmail")}</option>
              </Select>
            </div>
          </div>

          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="nd-label">
                {filteredResults.length === allResults.length
                  ? `${allResults.length} ${t("common.results")}`
                  : `${filteredResults.length} ${t("common.of")} ${allResults.length} ${t("common.results")}`}
              </span>
              <button
                className="text-[10px] font-mono text-accent hover:text-text-display transition-colors uppercase tracking-wider"
                onClick={toggleSelectAll}
              >
                {filteredWithIndex.length > 0 && filteredWithIndex.every((f) => selected.has(f.originalIndex))
                  ? t("common.deselectAll")
                  : t("common.selectAll")}
              </button>
            </div>
            <div className="flex items-center gap-3">
              {importResult && (
                <span className={`text-[11px] font-mono ${importResult.includes("Error") ? "text-accent" : "text-success"}`}>
                  {importResult}
                </span>
              )}
              <Button size="sm" onClick={importSelected} disabled={importing || selected.size === 0}>
                {importing
                  ? t("common.importing")
                  : `${t("search.import")} ${selected.size} ${t("common.selected")}`}
              </Button>
            </div>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto">
            <table className="nd-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>{t("search.business")}</th>
                  <th>{t("search.address")}</th>
                  <th>{t("search.rating")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("search.web")}</th>
                  <th>{t("common.email")}</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredWithIndex.map(({ place, originalIndex }) => (
                  <tr
                    key={originalIndex}
                    className={`cursor-pointer ${selected.has(originalIndex) ? "bg-bg-tertiary/30" : ""}`}
                    onClick={() => toggleSelect(originalIndex)}
                  >
                    <td>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        selected.has(originalIndex)
                          ? "border-accent bg-accent"
                          : "border-border"
                      }`}>
                        {selected.has(originalIndex) && <Check className="h-3 w-3 text-bg-primary" strokeWidth={2} />}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-text-primary">{place.title || "—"}</div>
                      <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider mt-0.5">
                        {place.category || "—"}
                      </div>
                    </td>
                    <td>
                      <div className="text-[11px] text-text-secondary max-w-[200px] truncate" title={place.address}>
                        {place.address || "—"}
                      </div>
                    </td>
                    <td>
                      {place.review_rating && place.review_rating !== "0" ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                          <span className="text-[11px] text-text-secondary">
                            {place.review_rating} ({place.review_count || 0})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-text-muted">—</span>
                      )}
                    </td>
                    <td className="text-[11px] text-text-secondary font-mono">
                      {place.phone || "—"}
                    </td>
                    <td>
                      {place.website ? (
                        <Globe className="h-3.5 w-3.5 text-success" strokeWidth={1.5} />
                      ) : (
                        <span className="text-[11px] text-text-muted">—</span>
                      )}
                    </td>
                    <td className="text-[11px] text-text-secondary font-mono">
                      {(() => {
                        if (!place.emails || place.emails === "[]") return "—";
                        try { const arr = JSON.parse(place.emails); return arr[0] || "—"; } catch { return place.emails.includes("@") ? place.emails : "—"; }
                      })()}
                    </td>
                    <td>
                      {place.link && (
                        <a
                          href={place.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-text-muted hover:text-text-primary transition-colors" strokeWidth={1.5} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when no active job */}
      {!activeJob && (
        <EmptyState
          icon={<MapPin className="h-10 w-10" strokeWidth={1.5} />}
          title={t("search.searchPrompt")}
          description={t("search.searchPromptDesc")}
        />
      )}

      {/* Completed with no results */}
      {activeJob?.status === "completed" && allResults.length === 0 && (
        <EmptyState
          icon={<Search className="h-10 w-10" strokeWidth={1.5} />}
          title={t("search.noResults")}
          description={t("search.noResultsDesc")}
        />
      )}
    </div>
  );
}
