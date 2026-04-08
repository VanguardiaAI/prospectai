"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  errorTitle?: string;
  errorDescription?: string;
  retryLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-accent" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-mono font-medium text-text-display uppercase tracking-wide">
              {this.props.errorTitle ?? "Something went wrong"}
            </h2>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {this.props.errorDescription ?? "An unexpected error occurred. You can try reloading this section."}
            </p>
            {this.state.error && (
              <pre className="text-[11px] font-mono text-text-muted bg-bg-secondary border border-border rounded-lg px-4 py-3 max-w-full overflow-x-auto whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-bg-secondary text-[11px] font-mono uppercase tracking-wide text-text-primary hover:bg-bg-tertiary hover:text-text-display transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              {this.props.retryLabel ?? "Retry"}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
