import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // Raise the warning threshold modestly to reflect the new chunked reality;
    // the real win is splitting, not hiding the warning.
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        /**
         * manualChunks — splits heavy node_modules out of the main entry chunk
         * so they are cached independently and initial load is smaller.
         *
         * Strategy (function form, robust to nested paths):
         *   react    → react, react-dom, react/jsx-runtime
         *   lucide   → lucide-react
         *   supabase → @supabase/supabase-js and its own sub-packages
         *   vendor   → everything else in node_modules
         *
         * App code (lazy route chunks created via React.lazy) is not touched;
         * Rollup keeps those as separate dynamic-import chunks automatically.
         */
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;

          // React core — tiny but very stable; great long-term cache hit
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react";
          }

          // Lucide icons — large icon library, changes only on dep bumps
          if (id.includes("/node_modules/lucide-react/")) {
            return "lucide";
          }

          // Supabase client + its internal packages (realtime-js, postgrest-js, etc.)
          if (id.includes("/node_modules/@supabase/")) {
            return "supabase";
          }

          // Everything else from node_modules → generic vendor chunk
          return "vendor";
        },
      },
    },
  },
});
