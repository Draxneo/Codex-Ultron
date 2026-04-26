import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isNativeWebView(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /android/i.test(ua) || /iphone|ipad|ipod/i.test(ua);
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);

    // Auto-recover on mobile native — techs don't realize they can tap Reload
    if (isNativeWebView()) {
      setTimeout(() => window.location.reload(), 2000);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {isNativeWebView()
              ? "Reloading automatically…"
              : this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
