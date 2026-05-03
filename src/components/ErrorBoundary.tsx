import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { logClientSystemError } from "@/lib/systemErrorLog";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isRecovering: boolean;
}

const CHUNK_RECOVERY_KEY = "ultraoffice:last-chunk-recovery";

function isNativeWebView(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /android/i.test(ua) || /iphone|ipad|ipod/i.test(ua);
}

function isRecoverableLoadError(error: Error): boolean {
  const message = `${error.name || ""} ${error.message || ""}`.toLowerCase();

  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror") ||
    message.includes("css chunk load failed")
  );
}

function canAutoRecover(): boolean {
  if (typeof window === "undefined") return false;

  const lastRecovery = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || "0");
  return !lastRecovery || Date.now() - lastRecovery > 30_000;
}

function reloadPage() {
  if (typeof window === "undefined") return;
  window.location.reload();
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isRecovering: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isRecovering: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);

    void logClientSystemError({
      sourceName: "react-error-boundary",
      message: error.message || "React render error",
      severity: isRecoverableLoadError(error) ? "warning" : "error",
      stackTrace: error.stack || errorInfo.componentStack || null,
      context: {
        error_name: error.name || null,
        component_stack: errorInfo.componentStack || null,
        recoverable_load_error: isRecoverableLoadError(error),
        native_webview: isNativeWebView(),
      },
    });

    if (isRecoverableLoadError(error) && canAutoRecover()) {
      window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
      this.setState({ isRecovering: true });
      setTimeout(reloadPage, 500);
      return;
    }

    // Auto-recover on mobile native so field techs are not stuck on a dead screen.
    if (isNativeWebView() && canAutoRecover()) {
      window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
      this.setState({ isRecovering: true });
      setTimeout(reloadPage, 2000);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.isRecovering
              ? "Refreshing this screen automatically. This usually happens right after a live update."
              : this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null, isRecovering: false });
              reloadPage();
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
