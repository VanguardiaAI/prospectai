"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ChatbotContextValue {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  sendMessage: (text: string) => void;
  registerSender: (fn: (text: string) => void) => void;
}

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

export function ChatbotProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const senderRef = useRef<((text: string) => void) | null>(null);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);

  const registerSender = useCallback((fn: (text: string) => void) => {
    senderRef.current = fn;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      setIsOpen(true);
      // Small delay to ensure chat is open and sender is registered
      setTimeout(() => {
        senderRef.current?.(text);
      }, 100);
    },
    []
  );

  return (
    <ChatbotContext value={{ isOpen, openChat, closeChat, sendMessage, registerSender }}>
      {children}
    </ChatbotContext>
  );
}

export function useChatbot() {
  const ctx = useContext(ChatbotContext);
  if (!ctx) throw new Error("useChatbot must be used within ChatbotProvider");
  return ctx;
}
