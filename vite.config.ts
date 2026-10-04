import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { Plugin } from "vite";
import { checkVersions } from "./scripts/check-version.mjs";

// Fails production builds on version mismatch; never runs in dev/serve.
function versionCheck(): Plugin {
  return {
    name: "version-check",
    apply: "build",
    buildStart() {
      const { errors, warnings } = checkVersions();
      for (const w of warnings) this.warn(w);
      if (errors.length) this.error(errors.join("\n"));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), versionCheck(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      mangle: {
        toplevel: true,
      },
      compress: {
        drop_console: false,
        passes: 2,
      },
    },
  },
}));
