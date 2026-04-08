"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Bot, User, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function Chatbot() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: newMessages.slice(-20), // Last 20 messages for context
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        setMessages((prev) => [...prev, { role: "assistant", content: err.error || "Error" }]);
        return;
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection error" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={clsx(
            "fixed bottom-6 right-6 z-50",
            "w-14 h-14 rounded-full",
            "bg-accent text-white shadow-lg",
            "flex items-center justify-center",
            "hover:scale-105 active:scale-95 transition-transform",
            "cursor-pointer"
          )}
          aria-label="Open chatbot"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={clsx(
            "fixed bottom-6 right-6 z-50",
            "w-96 h-[32rem] max-h-[80vh]",
            "bg-bg border border-muted/30 rounded-2xl shadow-2xl",
            "flex flex-col overflow-hidden"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-muted/20">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-accent" />
              <span className="font-semibold text-sm">ProspectAI Assistant</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-muted/10 cursor-pointer"
            >
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-muted text-sm mt-8">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>{t("chatbot.welcome") || "Ask me anything about your campaigns"}</p>
                <p className="text-xs mt-1 opacity-60">
                  {t("chatbot.examples") || "Try: \"list my campaigns\" or \"how many emails sent today?\""}
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={clsx(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-accent" />
                  </div>
                )}
                <div
                  className={clsx(
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-accent text-white"
                      : "bg-muted/10 text-fg"
                  )}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-muted/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-muted" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 items-center">
                <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="bg-muted/10 rounded-xl px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-muted/20 p-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("chatbot.placeholder") || "Type a message..."}
                className={clsx(
                  "flex-1 px-3 py-2 rounded-lg text-sm",
                  "bg-muted/5 border border-muted/20",
                  "focus:outline-none focus:border-accent/50",
                  "placeholder:text-muted/40"
                )}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className={clsx(
                  "px-3 py-2 rounded-lg",
                  "bg-accent text-white",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "hover:bg-accent/90 transition-colors",
                  "cursor-pointer"
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
