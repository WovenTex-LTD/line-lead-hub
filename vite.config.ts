import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { writeFileSync } from "fs";

// Generates a version.json in the build output so the app can detect new deployments.
function versionPlugin(): Plugin {
  const buildId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    name: "version-json",
    apply: "build",
    // Expose build ID to app code via import.meta.env
    config() {
      return { define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId) } };
    },
    // Write version.json alongside other assets after the bundle closes
    writeBundle() {
      writeFileSync(
        path.resolve(__dirname, "dist", "version.json"),
        JSON.stringify({ buildId, builtAt: new Date().toISOString() }),
      );
    },
  };
}

// Tauri packages that need special handling
const tauriPackages = [
  "@tauri-apps/api",
  "@tauri-apps/plugin-updater",
  "@tauri-apps/plugin-process",
  "@tauri-apps/plugin-shell",
];

// Check if we're building for Tauri (set by tauri build command)
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig(({ mode }) => ({
  // Bake Supabase env vars at build time so the app never blank-screens
  // if env vars are missing at runtime.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL ?? "https://varolnwetchstlfholbl.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
        process.env.SUPABASE_ANON_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcm9sbndldGNoc3RsZmhvbGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjY3NDMsImV4cCI6MjA4NjM0Mjc0M30.Bdjo1-1jvO25RVN3BJtZQ_CYfmuTSWyH4SC7PeG9pRc"
    ),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), versionPlugin()],
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // Only exclude Tauri plugins from pre-bundling in web mode
    exclude: isTauriBuild ? [] : tauriPackages,
    // Force include React packages to ensure single instance
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "next-themes",
    ],
    // Force re-bundling when deps change
    // force: true — removed to avoid unnecessary re-bundling on every dev start
    esbuildOptions: {
      // Ensure React is resolved to a single instance
      define: {
        global: "globalThis",
      },
    },
  },
  build: {
    rollupOptions: {
      // Only mark Tauri plugins as external for web builds, NOT for Tauri builds
      external: isTauriBuild
        ? []
        : (id) => tauriPackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`)),
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom", "react/jsx-runtime"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": [
            "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover", "@radix-ui/react-select",
            "@radix-ui/react-tabs", "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion", "@radix-ui/react-alert-dialog",
            "@radix-ui/react-checkbox", "@radix-ui/react-label",
            "@radix-ui/react-scroll-area", "@radix-ui/react-separator",
            "@radix-ui/react-slot", "@radix-ui/react-switch",
            "@radix-ui/react-toast", "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
          ],
          "vendor-charts": ["recharts"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-dates": ["date-fns"],
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          "vendor-i18n": ["i18next", "react-i18next"],
        },
      },
    },
  },
}));
