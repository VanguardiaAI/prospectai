"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Input, Select, EmptyState, Spinner, Badge, Modal } from "@/components/ui";
import { ShieldBan, Plus, Trash2 } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

interface BlacklistEntry {
  id: number;
  type: string;
  value: string;
  reason: string | null;
  createdAt: string;
}

export default function BlacklistPage() {
  const { t } = useT();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "domain", value: "", reason: "" });
  const [error, setError] = useState("");

  const fetchEntries = useCallback(async () => {
    const res = await fetch("/api/blacklist");
    setEntries(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const add = async () => {
    setError("");
    const res = await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowAdd(false);
      setForm({ type: "domain", value: "", reason: "" });
      fetchEntries();
    } else {
      const data = await res.json();
      setError(data.error);
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/blacklist?id=${id}`, { method: "DELETE" });
    fetchEntries();
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("blacklist.title")}</h1>
          <p className="nd-label mt-2">{t("blacklist.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("blacklist.add")}
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={<ShieldBan className="h-10 w-10" strokeWidth={1.5} />} title={t("blacklist.empty")} description={t("blacklist.emptyDesc")} />
      ) : (
        <Card dots>
          <div>
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Badge color={entry.type === "domain" ? "info" : entry.type === "email" ? "default" : "danger"}>
                    {entry.type.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-text-display font-mono truncate">{entry.value}</span>
                  {entry.reason && <span className="text-[11px] text-text-muted truncate">— {entry.reason}</span>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(entry.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-text-muted hover:text-accent transition-colors" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t("blacklist.addToBlacklist")}>
        <div className="space-y-5">
          <div>
            <label className="nd-label block mb-2">{t("blacklist.type")}</label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="domain">{t("blacklist.domain")}</option>
              <option value="email">{t("common.email")}</option>
              <option value="business">{t("blacklist.business")}</option>
            </Select>
          </div>
          <div>
            <label className="nd-label block mb-2">{t("blacklist.value")}</label>
            <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={form.type === "domain" ? t("blacklist.domainPlaceholder") : form.type === "email" ? t("blacklist.emailPlaceholder") : t("blacklist.businessPlaceholder")} />
          </div>
          <div>
            <label className="nd-label block mb-2">{t("blacklist.reasonOptional")}</label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t("blacklist.reasonPlaceholder")} />
          </div>
          {error && (
            <p className="text-[11px] text-accent font-mono">[ERROR] {error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAdd(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={add} disabled={!form.value}>{t("blacklist.add")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
