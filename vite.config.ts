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
    // Minify with terser for stronger obfuscation in production builds
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
        toplevel: true,
        dead_code: true,
        pure_getters: true,
      },
      mangle: {
        toplevel: true,
        properties: false, // Avoid mangling object properties to preserve runtime correctness
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        // Use content-hash chunk names to prevent predictable bundle discovery
        chunkFileNames: "assets/[hash].js",
        entryFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash].[ext]",
        // Split vendor chunks to reduce bundle size and improve cache efficiency
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
    // Disable source maps in production to prevent reverse engineering
    sourcemap: false,
  },
}));
