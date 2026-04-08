"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, ExternalLink, Server } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

interface ConfigItem {
  key: string;
  type: "env" | "setting";
  settingsSection?: string;
}

export function MissingConfigModal({
  open,
  onClose,
  items,
  warnings,
}: {
  open: boolean;
  onClose: () => void;
  items: ConfigItem[];
  warnings: string[];
}) {
  const { t } = useT();

  return (
    <Modal open={open} onClose={onClose} title={t("shortcuts.missingConfig.title")}>
      <p className="text-sm text-text-muted mb-5 font-mono">
        {t("shortcuts.missingConfig.subtitle")}
      </p>

      <div className="space-y-3 mb-5">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-start gap-3 p-3 rounded-lg border border-border-light bg-bg-tertiary/30"
          >
            <Server className="w-4 h-4 text-accent shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-text-primary">{item.key}</p>
              {item.type === "env" ? (
                <p className="text-[11px] text-text-muted mt-0.5">
                  {t("shortcuts.missingConfig.envHint")}
                </p>
              ) : (
                <Link
                  href={`/settings#${item.settingsSection || "general"}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-0.5"
                >
                  {t("shortcuts.missingConfig.settingLink")}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-wide text-text-muted mb-2">
            {t("shortcuts.missingConfig.warningsTitle")}
          </p>
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-yellow-500/80 mb-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("common.close") || "Close"}
        </Button>
        <Link href="/settings" onClick={onClose}>
          <Button variant="primary" size="sm">
            {t("shortcuts.missingConfig.goToSettings")}
          </Button>
        </Link>
      </div>
    </Modal>
  );
}
