"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" strokeWidth={1.5} />,
    error: <XCircle className="h-4 w-4 text-red-500 shrink-0" strokeWidth={1.5} />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" strokeWidth={1.5} />,
    info: <Info className="h-4 w-4 text-blue-500 shrink-0" strokeWidth={1.5} />,
  };

  const borders: Record<ToastType, string> = {
    success: "border-green-500/30",
    error: "border-red-500/30",
    warning: "border-yellow-500/30",
    info: "border-blue-500/30",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${borders[t.type]} bg-bg-secondary shadow-lg animate-slide-in font-mono text-sm text-text-primary`}
          >
            {icons[t.type]}
            <span className="flex-1 text-[13px]">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-text-muted hover:text-text-primary transition-colors">
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
