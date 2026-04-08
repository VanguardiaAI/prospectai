"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/LocaleProvider";

export function SearchInputModal({
  open,
  onClose,
  onSubmit,
  campaignName,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (keyword: string) => void;
  campaignName: string;
  loading: boolean;
}) {
  const { t } = useT();
  const [keyword, setKeyword] = useState("");

  const handleSubmit = () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setKeyword("");
  };

  const handleClose = () => {
    setKeyword("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={t("shortcuts.searchModal.title")}>
      <div className="mb-4">
        <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted">
          {t("shortcuts.searchModal.campaign")}
        </span>
        <p className="text-sm font-medium text-text-primary mt-0.5">{campaignName}</p>
      </div>

      <label className="block mb-1 text-[10px] font-mono uppercase tracking-wide text-text-muted">
        {t("shortcuts.searchModal.keywordLabel")}
      </label>
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder={t("shortcuts.searchModal.keywordPlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        autoFocus
        disabled={loading}
      />

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
          {t("shortcuts.searchModal.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!keyword.trim() || loading}
        >
          {t("shortcuts.searchModal.submit")}
        </Button>
      </div>
    </Modal>
  );
}
