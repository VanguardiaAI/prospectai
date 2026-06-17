"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

// "bar"   → docked input bar at the bottom (panel grows upward on open)
// "panel" → expanded: right-side dock on desktop, fullscreen on mobile
export type ChatMode = "bar" | "panel";

interface ChatbotContextValue {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  mode: ChatMode;
  setMode: (m: ChatMode) => void;
  expand: () => void;
  collapseToBar: () => void;
  sendMessage: (text: string) => void;
  registerSender: (fn: (text: string) => void) => void;
}

const ChatbotContext = createContext<ChatbotContextValue | null>(null);
const MODE_KEY = "prospectai.chatMode";

export function ChatbotProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setModeState] = useState<ChatMode>("bar");
  const senderRef = useRef<((text: string) => void) | null>(null);

  // Restore the expanded/bar preference across navigation + reloads.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MODE_KEY);
      if (raw === "panel") {
        setModeState("panel");
        setIsOpen(true);
      } else if (raw === "bar") {
        setModeState("bar");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setMode = useCallback((m: ChatMode) => {
    setModeState(m);
    if (m === "panel") setIsOpen(true);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const expand = useCallback(() => setMode("panel"), [setMode]);
  const collapseToBar = useCallback(() => setMode("bar"), [setMode]);

  const registerSender = useCallback((fn: (text: string) => void) => {
    senderRef.current = fn;
  }, []);

  const sendMessage = useCallback((text: string) => {
    setIsOpen(true);
    // Small delay to ensure chat is open and sender is registered.
    setTimeout(() => {
      senderRef.current?.(text);
    }, 100);
  }, []);

  return (
    <ChatbotContext
      value={{
        isOpen,
        openChat,
        closeChat,
        mode,
        setMode,
        expand,
        collapseToBar,
        sendMessage,
        registerSender,
      }}
    >
      {children}
    </ChatbotContext>
  );
}

export function useChatbot() {
  const ctx = useContext(ChatbotContext);
  if (!ctx) throw new Error("useChatbot must be used within ChatbotProvider");
  return ctx;
}
