import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installClientErrorLogging, logClientSystemError } from "@/lib/systemErrorLog";

installClientErrorLogging();

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
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
