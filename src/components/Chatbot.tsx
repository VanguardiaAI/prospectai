"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Loader2,
  Wrench,
  Check,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";
import { useChatbot } from "./ChatbotProvider";

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
          className="px-1 py-0.5 bg-muted/10 rounded text-[11px] font-mono"
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

// ─── Tool Call Indicator ────────────────────────────────────────────

function ToolIndicator({
  toolName,
  state,
}: {
  toolName: string;
  state: string;
}) {
  const isRunning = state === "call" || state === "partial-call";
  const displayName = toolName.replace(/_/g, " ");

  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono",
        "border",
        isRunning
          ? "border-accent/30 bg-accent/5 text-accent"
          : "border-success/30 bg-success/5 text-success"
      )}
    >
      {isRunning ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Check className="w-3 h-3" />
      )}
      <Wrench className="w-3 h-3" />
      <span className="truncate">{displayName}</span>
    </div>
  );
}

// ─── Suggested Prompts ──────────────────────────────────────────────

const SUGGESTED_PROMPTS_EN = [
  "List my campaigns",
  "How many emails sent today?",
  "Show dashboard metrics",
  "Check configuration",
];

const SUGGESTED_PROMPTS_ES = [
  "Lista mis campanas",
  "Cuantos emails envie hoy?",
  "Muestra metricas del dashboard",
  "Revisa la configuracion",
];

// ─── Message Parts Renderer ─────────────────────────────────────────

function MessageParts({ message }: { message: UIMessage }) {
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
            <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-accent" />
            </div>
          )}
          <div
            className={clsx(
              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
              message.role === "user"
                ? "bg-accent text-white rounded-br-md"
                : "bg-muted/8 text-fg border border-muted/10 rounded-bl-md"
            )}
          >
            {message.role === "assistant"
              ? renderMarkdown(textParts.join("\n"))
              : textParts.join("\n")}
          </div>
          {message.role === "user" && (
            <div className="w-6 h-6 rounded-lg bg-muted/15 flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-3.5 h-3.5 text-muted" />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main Chatbot Component ─────────────────────────────────────────

export function Chatbot() {
  const { t, lang } = useT();
  const { isOpen, openChat, closeChat, registerSender } = useChatbot();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    onError: (err) => {
      console.error("[Chatbot] error:", err);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Register the sender for external use (shortcuts widget)
  useEffect(() => {
    registerSender((text: string) => {
      sendMessage({ text });
    });
  }, [registerSender, sendMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("chatInput") as HTMLTextAreaElement;
    const text = input.value.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    input.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (!text || isLoading) return;
      sendMessage({ text });
      e.currentTarget.value = "";
    }
  };

  const suggestedPrompts =
    lang === "es" ? SUGGESTED_PROMPTS_ES : SUGGESTED_PROMPTS_EN;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => (isOpen ? closeChat() : openChat())}
        className={clsx(
          "fixed bottom-6 right-6 z-50",
          "w-14 h-14 rounded-full",
          "bg-accent text-white shadow-lg",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-all duration-200",
          "cursor-pointer",
          isOpen && "rotate-90 scale-90 opacity-0 pointer-events-none"
        )}
        aria-label="Open chatbot"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Chat panel */}
      <div
        className={clsx(
          "fixed bottom-6 right-6 z-50",
          "w-[400px] h-[520px] max-h-[85vh]",
          "bg-bg/95 backdrop-blur-xl border border-muted/20 rounded-2xl",
          "shadow-2xl shadow-black/10",
          "flex flex-col overflow-hidden",
          "transition-all duration-300 ease-out origin-bottom-right",
          isOpen
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-95 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-muted/15 bg-bg/60 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <div>
              <span className="font-semibold text-sm text-fg leading-none">
                ProspectAI
              </span>
              <span className="block text-[10px] text-muted font-mono mt-0.5">
                {isLoading
                  ? t("chatbot.thinking") || "Thinking..."
                  : t("chatbot.status") || "AI Assistant"}
              </span>
            </div>
          </div>
          <button
            onClick={closeChat}
            className="p-1.5 rounded-lg hover:bg-muted/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.length === 0 && (
            <div className="text-center mt-10">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-6 h-6 text-accent opacity-60" />
              </div>
              <p className="text-sm text-fg font-medium mb-1">
                {t("chatbot.welcome") ||
                  "Ask me anything about your campaigns"}
              </p>
              <p className="text-[11px] text-muted mb-6">
                {t("chatbot.examples") ||
                  "I can manage campaigns, search leads, review emails, and more"}
              </p>

              {/* Suggested prompts */}
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage({ text: prompt })}
                    className={clsx(
                      "px-3 py-1.5 rounded-full text-[11px] font-mono",
                      "border border-muted/20 text-muted",
                      "hover:border-accent/40 hover:text-accent",
                      "transition-colors cursor-pointer"
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageParts key={msg.id} message={msg} />
          ))}

          {/* Loading indicator */}
          {isLoading && messages.length > 0 && (() => {
            const lastMsg = messages[messages.length - 1];
            const hasText = lastMsg?.parts.some(p => p.type === "text" && (p as { text: string }).text.length > 0);
            if (lastMsg?.role === "assistant" && !hasText) {
              return (
                <div className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <div className="bg-muted/8 border border-muted/10 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted/40 animate-bounce [animation-delay:0ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted/40 animate-bounce [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Input */}
        <div className="border-t border-muted/15 p-3 bg-bg/60 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              name="chatInput"
              onKeyDown={handleKeyDown}
              placeholder={t("chatbot.placeholder") || "Type a message..."}
              rows={1}
              className={clsx(
                "flex-1 px-3.5 py-2.5 rounded-xl text-sm resize-none",
                "bg-muted/5 border border-muted/15",
                "focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20",
                "placeholder:text-muted/40",
                "max-h-24 min-h-[40px]",
                "transition-colors"
              )}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className={clsx(
                "w-10 h-10 rounded-xl shrink-0",
                "flex items-center justify-center",
                "transition-all duration-200",
                "cursor-pointer",
                !isLoading
                  ? "bg-accent text-white hover:bg-accent/90 shadow-sm"
                  : "bg-muted/10 text-muted/30 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
