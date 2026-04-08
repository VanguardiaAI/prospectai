"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Spinner } from "@/components/ui";
import { ChevronLeft, ChevronRight, Calendar, Mail, MessageCircle } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";

interface DayData {
  date: string;
  sent: number;
  approved: number;
  waSent: number;
  waApproved: number;
}

function getHeatColor(count: number): string {
  if (count === 0) return "";
  if (count <= 2) return "bg-accent/10";
  if (count <= 5) return "bg-accent/20";
  if (count <= 10) return "bg-accent/35";
  if (count <= 20) return "bg-accent/50";
  return "bg-accent/70";
}

export default function CalendarPage() {
  const { t, tArray } = useT();
  const MONTH_NAMES = tArray("calendar.months");
  const DAY_LABELS = tArray("calendar.days");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar?month=${month}&year=${year}`);
    const data = await res.json();
    setDays(data.days);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const goBack = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goForward = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  // Calculate grid offset: which day of the week does the 1st fall on?
  // JS getDay(): 0=Sun, we need 0=Mon
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const totalSent = days.reduce((sum, d) => sum + d.sent, 0);
  const totalApproved = days.reduce((sum, d) => sum + d.approved, 0);
  const totalWaSent = days.reduce((sum, d) => sum + d.waSent, 0);
  const daysWithSends = days.filter((d) => d.sent > 0 || d.waSent > 0).length;
  const avgDaily = days.length > 0 ? ((totalSent + totalWaSent) / days.length).toFixed(1) : "0";

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("calendar.title")}</h1>
          <p className="nd-label mt-2">{t("calendar.subtitle")}</p>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goBack}
          className="p-2 rounded-lg border border-border hover:bg-bg-tertiary transition-colors duration-150 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 text-text-primary" strokeWidth={1.5} />
        </button>
        <h2 className="nd-heading text-[16px]">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <button
          onClick={goForward}
          className="p-2 rounded-lg border border-border hover:bg-bg-tertiary transition-colors duration-150 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4 text-text-primary" strokeWidth={1.5} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Calendar grid */}
          <Card flush>
            <div className="p-4">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="text-center py-2 nd-label text-[10px] text-text-muted"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: offset }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {/* Actual days */}
                {days.map((day) => {
                  const dayNum = parseInt(day.date.split("-")[2]);
                  const total = day.sent + day.approved + day.waSent + day.waApproved;
                  const isToday = day.date === todayStr;

                  return (
                    <div
                      key={day.date}
                      className={clsx(
                        "aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 relative",
                        isToday
                          ? "border-accent"
                          : "border-border",
                        total > 0
                          ? getHeatColor(total)
                          : "hover:bg-bg-tertiary/50"
                      )}
                    >
                      <span
                        className={clsx(
                          "text-[12px] font-mono tabular-nums leading-none",
                          isToday
                            ? "text-accent font-medium"
                            : total > 0
                              ? "text-text-display"
                              : "text-text-muted"
                        )}
                      >
                        {dayNum}
                      </span>

                      {day.sent > 0 && (
                        <span className="text-[9px] font-mono text-accent tabular-nums leading-none flex items-center gap-0.5">
                          <Mail className="h-2.5 w-2.5" strokeWidth={1.5} /> {day.sent}
                        </span>
                      )}
                      {day.waSent > 0 && (
                        <span className="text-[9px] font-mono text-green-500 tabular-nums leading-none flex items-center gap-0.5">
                          <MessageCircle className="h-2.5 w-2.5" strokeWidth={1.5} /> {day.waSent}
                        </span>
                      )}

                      {day.approved > 0 && (
                        <span className="text-[9px] font-mono text-success tabular-nums leading-none flex items-center gap-0.5">
                          <Mail className="h-2.5 w-2.5" strokeWidth={1.5} /> {day.approved} {t("calendar.approved")}
                        </span>
                      )}
                      {day.waApproved > 0 && (
                        <span className="text-[9px] font-mono text-green-500/70 tabular-nums leading-none flex items-center gap-0.5">
                          <MessageCircle className="h-2.5 w-2.5" strokeWidth={1.5} /> {day.waApproved} {t("calendar.approved")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Summary row */}
          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-accent" strokeWidth={1.5} />
                  <span className="nd-label">{t("calendar.monthSummary")}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="text-center">
                  <p className="text-[18px] font-mono font-light text-accent tabular-nums leading-none">
                    {totalSent}
                  </p>
                  <p className="nd-label text-[9px] mt-1">{t("calendar.emailsSent")}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-[18px] font-mono font-light text-green-500 tabular-nums leading-none">
                    {totalWaSent}
                  </p>
                  <p className="nd-label text-[9px] mt-1">{t("calendar.waSent")}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-[18px] font-mono font-light text-text-display tabular-nums leading-none">
                    {avgDaily}
                  </p>
                  <p className="nd-label text-[9px] mt-1">{t("calendar.dailyAverage")}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-[18px] font-mono font-light text-success tabular-nums leading-none">
                    {totalApproved}
                  </p>
                  <p className="nd-label text-[9px] mt-1">{t("calendar.pendingApproved")}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-[18px] font-mono font-light text-text-display tabular-nums leading-none">
                    {daysWithSends}
                  </p>
                  <p className="nd-label text-[9px] mt-1">{t("calendar.activeDays")}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Heat map legend */}
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">{t("calendar.less")}</span>
            <div className="flex gap-0.5">
              <div className="w-3 h-3 rounded-sm border border-border" />
              <div className="w-3 h-3 rounded-sm bg-accent/10" />
              <div className="w-3 h-3 rounded-sm bg-accent/20" />
              <div className="w-3 h-3 rounded-sm bg-accent/35" />
              <div className="w-3 h-3 rounded-sm bg-accent/50" />
              <div className="w-3 h-3 rounded-sm bg-accent/70" />
            </div>
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">{t("calendar.more")}</span>
          </div>
        </>
      )}
    </div>
  );
}
