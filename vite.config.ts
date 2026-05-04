import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("dompurify")) return "vendor-docs";
          if (id.includes("@dnd-kit") || id.includes("sortable")) return "vendor-dnd";
          if (id.includes("@capacitor") || id.includes("@capgo")) return "vendor-native";
          return undefined;
        },
      },
    },
  },
}));
