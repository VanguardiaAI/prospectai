"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  Send,
  Bot,
  User,
  Loader2,
  Wrench,
  Check,
  Sparkles,
  Lightbulb,
  ChevronDown,
  Trash2,
  AlertCircle,
  PanelRight,
  Minimize2,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";
import { useChatbot } from "./ChatbotProvider";
import { useCampaign } from "./CampaignProvider";
import { ChatbotShortcuts } from "./ChatbotShortcuts";
import { useProactive } from "./useProactive";
import { WhatsAppConnect } from "./WhatsAppConnect";

// ─── Minimal Markdown Renderer ──────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      elements.push(<br key={`br-${i}`} />);
      continue;
    }

    if (/^[-*]\s/.test(line.trim())) {
      const content = line.trim().replace(/^[-*]\s/, "");
      elements.push(
        <div key={`li-${i}`} className="flex gap-1.5 ml-1">
          <span className="text-accent mt-0.5 shrink-0">-</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <span key={`p-${i}`}>
        {renderInline(line)}
        {i < lines.length - 1 && lines[i + 1]?.trim() !== "" ? <br /> : null}
      </span>
    );
  }

  return elements;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={`i-${key++}`} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <code
          key={`c-${key++}`}
          className="px-1 py-0.5 bg-bg-tertiary rounded text-[11px] font-mono"
        >
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// CLI tools surface as `mcp__<server>__<tool>` — strip the prefix so the label
// reads the same across all providers.
function prettyToolName(name: string): string {
  return name.replace(/^mcp__[a-z0-9-]+__/i, "").replace(/_/g, " ");
}

// ─── Tool Call Indicator ────────────────────────────────────────────

function ToolIndicator({
  toolName,
  state,
}: {
  toolName: string;
  state: string;
}) {
  const isRunning = state === "call" || state === "partial-call" || state === "input-streaming" || state === "input-available";

  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono",
        "border",
        isRunning
          ? "border-accent/30 bg-accent-subtle text-accent"
          : "border-success/30 bg-success-subtle text-success"
      )}
    >
      {isRunning ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Check className="w-3 h-3" />
      )}
      <Wrench className="w-3 h-3" />
      <span className="truncate">{prettyToolName(toolName)}</span>
    </div>
  );
}

// ─── Message Parts Renderer ─────────────────────────────────────────

function MessageParts({ message }: { message: UIMessage }) {
  const { t } = useT();
  // Proactive nudges are injected client-side with a `proactive-` id prefix so we
  // can tag them as suggestions and set them apart from replies to the user.
  const isProactive =
    message.role === "assistant" && message.id.startsWith("proactive-");
  const toolParts: { toolName: string; state: string }[] = [];
  const textParts: string[] = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      textParts.push(part.text);
    } else if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
      const p = part as { type: string; toolName?: string; state?: string };
      const name = p.toolName || part.type.replace("tool-", "");
      toolParts.push({ toolName: name, state: p.state || "result" });
    }
  }

  return (
    <>
      {/* Tool indicators */}
      {toolParts.length > 0 && (
        <div className="flex gap-2 mb-2">
          <div className="w-5 h-5 shrink-0" />
          <div className="flex flex-wrap gap-1.5">
            {toolParts.map((tp, idx) => (
              <ToolIndicator
                key={`tool-${idx}`}
                toolName={tp.toolName}
                state={tp.state}
              />
            ))}
          </div>
        </div>
      )}

      {/* Text content */}
      {textParts.length > 0 && (
        <div
          className={clsx(
            "flex gap-2",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {message.role === "assistant" && (
            <div className="w-6 h-6 rounded-lg bg-accent-subtle flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-accent" />
            </div>
          )}
          <div
            className={clsx(
              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              message.role === "user"
                ? "bg-accent text-white rounded-br-md"
                : isProactive
                ? "bg-accent-subtle text-text-primary border border-accent/30 rounded-bl-md"
                : "bg-bg-tertiary text-text-primary border border-border rounded-bl-md"
            )}
          >
            {isProactive && (
              <div className="flex items-center gap-1 mb-1 text-accent">
                <Lightbulb className="w-3 h-3" />
                <span className="nd-label">
                  {t("chatbot.suggestion") || "Sugerencia"}
                </span>
              </div>
            )}
            {message.role === "assistant"
              ? renderMarkdown(textParts.join("\n"))
              : textParts.join("\n")}
          </div>
          {message.role === "user" && (
            <div className="w-6 h-6 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-3.5 h-3.5 text-text-secondary" />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main Chatbot — always-present bottom bar ───────────────────────

export function Chatbot() {
  const { t } = useT();
  const { isOpen, openChat, closeChat, mode, expand, collapseToBar, registerSender } =
    useChatbot();
  const { selectedId } = useCampaign();
  const pathname = usePathname();
  // Keep the latest campaign scope + page reachable from the (stably-registered) sender.
  const campaignIdRef = useRef<number | null>(selectedId);
  useEffect(() => {
    campaignIdRef.current = selectedId;
  }, [selectedId]);
  const pathnameRef = useRef<string>(pathname || "/");
  useEffect(() => {
    pathnameRef.current = pathname || "/";
  }, [pathname]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [proactiveEnabled, setProactiveEnabled] = useState(false);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    onError: (err) => {
      console.error("[Chatbot] error:", err);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";
  const isPanel = mode === "panel";
  // In panel mode the conversation is always shown; in bar mode it's gated by isOpen.
  const showConversation = isPanel || isOpen;

  // Active AI provider (status label) + the two chat-mode flags (dev mode badge,
  // proactive nudges).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setProvider(d?.ai_provider || "claude_cli");
        setDevMode(d?.chatbot_dev_mode === "true");
        setProactiveEnabled(d?.proactive_chat_enabled !== "false");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const providerLabel =
    provider === "anthropic"
      ? "Anthropic"
      : provider === "gemini"
      ? "Gemini"
      : "Claude CLI";

  // Register the sender for external use (command palette, shortcuts).
  useEffect(() => {
    registerSender((text: string) => {
      sendMessage(
        { text },
        { body: { campaignId: campaignIdRef.current, path: pathnameRef.current } }
      );
    });
  }, [registerSender, sendMessage]);

  // Inject a proactive nudge as an in-thread assistant message. The `proactive-`
  // id prefix lets MessageParts tag it as a suggestion. (Stability isn't needed —
  // useProactive reads this through a ref — so no useCallback.)
  const proactiveSeq = useRef(0);
  const injectProactive = (text: string) => {
    const id = `proactive-${proactiveSeq.current++}-${text.length}`;
    setMessages((prev) => [
      ...prev,
      { id, role: "assistant", parts: [{ type: "text", text }] } as UIMessage,
    ]);
    openChat();
  };

  useProactive({
    pathname: pathname || "/",
    active: provider === "claude_cli" && proactiveEnabled,
    isLoading,
    onMessage: injectProactive,
  });

  // Show the inline WhatsApp QR/status panel when the most recent assistant turn
  // ran a WhatsApp connect/status tool. (Derived each render; the React Compiler
  // handles memoization.)
  const showWhatsAppConnect = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      return m.parts.some((p) => {
        const name =
          (p as { toolName?: string }).toolName ||
          (p.type.startsWith("tool-") ? p.type.replace("tool-", "") : "");
        return /connect_whatsapp|get_whatsapp_status/.test(name);
      });
    }
    return false;
  })();

  // Auto-scroll to bottom while the conversation is visible.
  useEffect(() => {
    if (showConversation && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status, showConversation]);

  const submitText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    sendMessage(
      { text: trimmed },
      { body: { campaignId: selectedId, path: pathname || "/" } }
    );
    openChat();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("chatInput") as HTMLTextAreaElement;
    submitText(input.value);
    input.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitText(e.currentTarget.value);
      e.currentTarget.value = "";
    }
  };

  const errorMessage = error
    ? // The route streams a useful message via onError; surface it verbatim.
      (() => {
        try {
          const parsed = JSON.parse(error.message);
          return parsed?.error || error.message;
        } catch {
          return error.message;
        }
      })()
    : null;

  // ─── Shared brand/header strip ───
  const headerLeft = (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg bg-accent-subtle flex items-center justify-center">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
      </div>
      <span className="text-sm font-semibold text-text-display leading-none">
        ProspectAI
      </span>
      <span className="nd-label text-text-secondary">
        {isLoading ? t("chatbot.thinking") || "Pensando…" : providerLabel}
      </span>
      {devMode && (
        <span
          className="nd-label text-accent border border-accent/40 rounded px-1 leading-none"
          title={t("chatbot.devModeHint") || "Modo desarrollador activo (localhost)"}
        >
          DEV
        </span>
      )}
    </div>
  );

  const clearButton =
    messages.length > 0 ? (
      <button
        onClick={() => setMessages([])}
        className="p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer text-text-secondary"
        title={t("chatbot.clear") || "Limpiar conversación"}
        aria-label="Clear conversation"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    ) : null;

  // ─── Shared conversation body ───
  const conversation = (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {messages.length === 0 && (
        <div className="text-center mt-8 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-accent-subtle flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-accent opacity-70" />
          </div>
          <p className="text-sm text-text-display font-medium mb-1">
            {t("chatbot.welcome") || "Pregúntame lo que sea sobre tus campañas"}
          </p>
          <p className="text-[11px] text-text-secondary mb-6">
            {t("chatbot.examples") ||
              "Puedo crear campañas, buscar leads, revisar emails y más"}
          </p>

          <ChatbotShortcuts onSelect={submitText} />
        </div>
      )}

      {messages.map((msg) => (
        <MessageParts key={msg.id} message={msg} />
      ))}

      {/* Inline WhatsApp QR / connection status (after a connect tool runs) */}
      {showWhatsAppConnect && <WhatsAppConnect />}

      {/* Loading indicator */}
      {isLoading &&
        messages.length > 0 &&
        (() => {
          const lastMsg = messages[messages.length - 1];
          const hasText = lastMsg?.parts.some(
            (p) => p.type === "text" && (p as { text: string }).text.length > 0
          );
          if (lastMsg?.role === "assistant" && !hasText) {
            return (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-lg bg-accent-subtle flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="bg-bg-tertiary border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 animate-bounce [animation-delay:0ms]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 animate-bounce [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

      {/* Error row */}
      {errorMessage && (
        <div className="flex gap-2 items-start">
          <div className="w-6 h-6 rounded-lg bg-accent-subtle flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed bg-accent-subtle border border-accent/30 text-text-primary">
            {renderMarkdown(errorMessage)}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Shared input form ───
  const inputForm = (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-2xl border border-border bg-bg-secondary px-2.5 py-2 shadow-lg shadow-black/20"
    >
      <button
        type="button"
        onClick={() => (isPanel ? collapseToBar() : isOpen ? closeChat() : openChat())}
        className="w-9 h-9 shrink-0 self-center rounded-xl bg-accent-subtle flex items-center justify-center cursor-pointer hover:bg-accent/15 transition-colors"
        aria-label={isPanel ? "Collapse to bar" : isOpen ? "Collapse chat" : "Expand chat"}
        title={providerLabel}
      >
        <Sparkles className="w-4 h-4 text-accent" />
      </button>

      <textarea
        ref={inputRef}
        name="chatInput"
        onKeyDown={handleKeyDown}
        onFocus={isPanel ? undefined : openChat}
        placeholder={
          t("chatbot.placeholder") ||
          "Pídele al agente que cree campañas, busque leads…"
        }
        rows={1}
        className={clsx(
          "flex-1 px-2 py-2 rounded-xl text-sm resize-none bg-transparent",
          "focus:outline-none",
          "placeholder:text-text-muted",
          "max-h-32 min-h-[36px]"
        )}
      />
      <button
        type="submit"
        disabled={isLoading}
        className={clsx(
          "w-9 h-9 rounded-xl shrink-0 self-center",
          "flex items-center justify-center",
          "transition-all duration-200 cursor-pointer",
          !isLoading
            ? "bg-accent text-white hover:bg-accent/90 shadow-sm"
            : "bg-bg-tertiary text-text-muted cursor-not-allowed"
        )}
        aria-label="Send message"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </form>
  );

  // ─── Expanded mode: right-side dock (desktop) / fullscreen (mobile) ───
  if (isPanel) {
    return (
      <div className="fixed z-[80] flex flex-col bg-bg-secondary inset-0 lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:w-[420px] lg:border-l lg:border-border">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          {headerLeft}
          <div className="flex items-center gap-1">
            {clearButton}
            <button
              onClick={collapseToBar}
              className="p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer text-text-secondary"
              title={t("chatbot.dockBottom") || "Acoplar abajo"}
              aria-label="Collapse to bottom bar"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {conversation}

        <div className="px-3 py-3 border-t border-border">{inputForm}</div>
      </div>
    );
  }

  // ─── Bar mode: always-present bottom bar + upward panel ───
  return (
    <div className="nd-chatdock fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="mx-auto max-w-[1100px] px-4 lg:px-8 pb-4 pointer-events-auto">
        {/* Expanded conversation panel (grows upward) */}
        <div
          className={clsx(
            "mb-2 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-secondary shadow-2xl shadow-black/30",
            "transition-all duration-300 ease-out origin-bottom",
            isOpen
              ? "opacity-100 translate-y-0 scale-100"
              : "pointer-events-none h-0 opacity-0 translate-y-3 scale-[0.98] mb-0 border-transparent"
          )}
          style={{ maxHeight: isOpen ? "min(60vh, 560px)" : 0 }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            {headerLeft}
            <div className="flex items-center gap-1">
              <button
                onClick={expand}
                className="p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer text-text-secondary"
                title={t("chatbot.expand") || "Expandir a panel lateral"}
                aria-label="Expand to side panel"
              >
                <PanelRight className="w-4 h-4" />
              </button>
              {clearButton}
              <button
                onClick={closeChat}
                className="p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer text-text-secondary"
                aria-label="Collapse chat"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {conversation}
        </div>

        {/* Always-present input bar */}
        {inputForm}
      </div>
    </div>
  );
}
