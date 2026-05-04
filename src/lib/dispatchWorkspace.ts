export const DISPATCH_WORKSPACE_WINDOW_NAME = "ultraoffice-dispatch-workspace";

let dispatchWorkspaceWindow: Window | null = null;

export function resolveDispatchWorkspaceUrl(pathOrUrl: string): string | null {
  if (typeof window === "undefined") return null;

  const target = pathOrUrl.trim();
  if (!target) return null;

  try {
    const url = new URL(target, window.location.origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function openDispatchWorkspace(pathOrUrl: string): Window | null {
  const fullUrl = resolveDispatchWorkspaceUrl(pathOrUrl);
  if (!fullUrl) return null;
  const url = new URL(fullUrl);
  const isSameOrigin = url.origin === window.location.origin;

  const existingWindow =
    dispatchWorkspaceWindow && !dispatchWorkspaceWindow.closed
      ? dispatchWorkspaceWindow
      : null;

  const opened =
    existingWindow ??
    window.open(
      fullUrl,
      DISPATCH_WORKSPACE_WINDOW_NAME,
      isSameOrigin ? undefined : "noopener,noreferrer"
    );

  if (!opened) return null;

  dispatchWorkspaceWindow = opened;

  try {
    if (isSameOrigin) {
      opened.opener = null;
    }
    if (opened.location.href !== fullUrl) {
      opened.location.href = fullUrl;
    }
  } catch {
    window.open(fullUrl, DISPATCH_WORKSPACE_WINDOW_NAME, "noopener,noreferrer");
  }

  try {
    opened.focus();
  } catch {
    // Browser settings may block focusing a reused window.
  }

  return opened;
}
