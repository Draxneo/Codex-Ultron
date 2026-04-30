import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const lastAttempt = Number(sessionStorage.getItem("chunk-reload-attempted-at") || "0");
  if (Date.now() - lastAttempt < 10_000) return;
  sessionStorage.setItem("chunk-reload-attempted-at", String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
