import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Use terser for production minification with aggressive options
    minify: mode === "production" ? "terser" : "esbuild",
    terserOptions: {
      compress: {
        // Remove all console.log/debug/info calls from production bundle
        drop_console: true,
        drop_debugger: true,
        // Aggressive dead-code elimination
        passes: 3,
        pure_funcs: ["console.log", "console.debug", "console.info"],
        // Remove unreachable code
        dead_code: true,
        // Collapse variable declarations
        collapse_vars: true,
        // Inline small functions
        inline: 3,
        // Use Boolean-aware optimizations
        booleans: true,
        // Reduce sequences
        sequences: true,
      },
      mangle: {
        // Mangle top-level names aggressively
        toplevel: true,
        // Mangle property names where safe
        properties: false,
      },
      format: {
        // Remove comments from output
        comments: false,
      },
    },
    sourcemap: false,
    rollupOptions: {
      output: {
        // Randomise chunk file names to make reconstruction harder
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        // Disable manual chunk splitting to reduce predictable structure
        manualChunks: undefined,
      },
    },
  },
}));
