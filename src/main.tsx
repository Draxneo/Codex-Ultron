import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installClientErrorLogging, logClientSystemError } from "@/lib/systemErrorLog";

installClientErrorLogging();

// 2026-05-04: Smoother UX when a code-split chunk fails to load. Vite fires
// preloadError when a lazy() module URL 404s — usually because the user has a
// stale tab open and we deployed a new version with new chunk hashes. We
// previously hard-reloaded the page silently, which felt to dispatchers like
// the app was crashing mid-task. Now:
//   1) Show a small full-screen overlay so the dispatcher SEES the update
//      happening — "Updating UltraOffice…" instead of an unexplained reload.
//   2) Wait 600ms so the message registers before the reload kicks in.
//   3) Throttle to once per 10s so we never reload-loop.
//   4) Still log to system_error_log so we can spot pathological cases.
// 2026-05-04: Also catch ChunkLoadError thrown by lazyNamed() in App.tsx when
// a stale chunk loads but its named export is missing. Same UX as
// vite:preloadError — show the 'Updating UltraOffice…' overlay and reload.
function reloadForStaleChunk(reason: string) {
  void logClientSystemError({
    sourceName: "client-preload",
    message: "A live-update file failed to load; refreshing the app.",
    severity: "warning",
    context: { event_type: reason },
  });
  const lastAttempt = Number(sessionStorage.getItem("chunk-reload-attempted-at") || "0");
  if (Date.now() - lastAttempt < 10_000) return;
  sessionStorage.setItem("chunk-reload-attempted-at", String(Date.now()));
  try {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647",
      "background:rgba(15,23,42,0.92)", "color:#fff",
      "display:flex", "flex-direction:column", "align-items:center",
      "justify-content:center", "gap:12px",
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "font-size:15px",
    ].join(";");
    overlay.innerHTML =
      '<div style="font-weight:600;font-size:16px">Updating UltraOffice…</div>' +
      '<div style="opacity:0.75;font-size:13px">A new version is being applied. One second.</div>';
    document.body.appendChild(overlay);
  } catch {
    // ignore
  }
  setTimeout(() => window.location.reload(), 600);
}

window.addEventListener("error", (event) => {
  const err = event.error;
  // ChunkLoadError can be a thrown Error with name='ChunkLoadError' OR a
  // plain message. Match either. Also catch the more verbose message that
  // appears when the named-export guard in lazyNamed throws.
  const name = (err && (err.name || "")) as string;
  const msg = (err && (err.message || event.message || "")) as string;
  if (name === "ChunkLoadError" || /chunk|loading css chunk|stale chunk after redeploy/i.test(msg)) {
    reloadForStaleChunk("error_chunk_load");
  }
});

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  void logClientSystemError({
    sourceName: "client-preload",
    message: "A live-update file failed to load; refreshing the app.",
    severity: "warning",
    context: {
      event_type: "vite:preloadError",
    },
  });
  const lastAttempt = Number(sessionStorage.getItem("chunk-reload-attempted-at") || "0");
  if (Date.now() - lastAttempt < 10_000) return;
  sessionStorage.setItem("chunk-reload-attempted-at", String(Date.now()));

  try {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "background:rgba(15,23,42,0.92)",
      "color:#fff",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:12px",
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "font-size:15px",
    ].join(";");
    overlay.innerHTML =
      '<div style="font-weight:600;font-size:16px">Updating UltraOffice…</div>' +
      '<div style="opacity:0.75;font-size:13px">A new version is being applied. One second.</div>';
    document.body.appendChild(overlay);
  } catch {
    // If DOM is in a weird state, skip the overlay and just reload.
  }

  setTimeout(() => window.location.reload(), 600);
});

createRoot(document.getElementById("root")!).render(<App />);
