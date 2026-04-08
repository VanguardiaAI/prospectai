"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useT } from "@/i18n/LocaleProvider";
import { ScanSearch } from "lucide-react";
import { clsx } from "clsx";

type AnalyzeOption = "all" | "custom";

export function AnalyzeOptionsModal({
  open,
  onClose,
  onSubmit,
  campaignName,
  pendingCount,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (limit?: number) => void;
  campaignName: string;
  pendingCount: number;
  loading: boolean;
}) {
  const { t } = useT();
  const [option, setOption] = useState<AnalyzeOption>("all");
  const [customLimit, setCustomLimit] = useState("");

  const handleSubmit = () => {
    if (option === "all") {
      onSubmit(undefined);
    } else {
      const num = parseInt(customLimit, 10);
      if (!num || num < 1) return;
      onSubmit(num);
    }
  };

  const handleClose = () => {
    setOption("all");
    setCustomLimit("");
    onClose();
  };

  const isValid =
    option === "all" || (option === "custom" && parseInt(customLimit, 10) > 0);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("shortcuts.analyzeModal.title")}
    >
      <div className="mb-4">
        <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted">
          {t("shortcuts.analyzeModal.campaign")}
        </span>
        <p className="text-sm font-medium text-text-primary mt-0.5">
          {campaignName}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/10">
        <ScanSearch className="w-4 h-4 text-accent shrink-0" />
        <span className="text-xs text-text-secondary">
          {t("shortcuts.analyzeModal.pendingCount", { count: pendingCount })}
        </span>
      </div>

      <div className="space-y-2">
        <label className="block text-[10px] font-mono uppercase tracking-wide text-text-muted mb-2">
          {t("shortcuts.analyzeModal.optionLabel")}
        </label>

        {/* All */}
        <button
          type="button"
          onClick={() => setOption("all")}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer",
            option === "all"
              ? "border-accent/40 bg-accent/5"
              : "border-muted/10 hover:border-muted/20"
          )}
        >
          <div
            className={clsx(
              "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
              option === "all" ? "border-accent" : "border-muted/30"
            )}
          >
            {option === "all" && (
              <div className="w-2 h-2 rounded-full bg-accent" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("shortcuts.analyzeModal.allOption", { count: pendingCount })}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {t("shortcuts.analyzeModal.allDescription")}
            </p>
          </div>
        </button>

        {/* Custom */}
        <button
          type="button"
          onClick={() => setOption("custom")}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer",
            option === "custom"
              ? "border-accent/40 bg-accent/5"
              : "border-muted/10 hover:border-muted/20"
          )}
        >
          <div
            className={clsx(
              "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
              option === "custom" ? "border-accent" : "border-muted/30"
            )}
          >
            {option === "custom" && (
              <div className="w-2 h-2 rounded-full bg-accent" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">
              {t("shortcuts.analyzeModal.customOption")}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {t("shortcuts.analyzeModal.customDescription")}
            </p>
          </div>
        </button>

        {option === "custom" && (
          <div className="pl-7 pt-1">
            <Input
              type="number"
              min={1}
              max={pendingCount}
              value={customLimit}
              onChange={(e) => setCustomLimit(e.target.value)}
              placeholder={t("shortcuts.analyzeModal.customPlaceholder", {
                max: pendingCount,
              })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoFocus
              disabled={loading}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
          {t("shortcuts.analyzeModal.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!isValid || loading}
        >
          {t("shortcuts.analyzeModal.submit")}
        </Button>
      </div>
    </Modal>
  );
}
