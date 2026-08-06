import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Garden serves at /seed/<slug>/; relative asset paths keep the build
  // portable across that subpath and Cloudflare's root deploy.
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          jszip: ["jszip"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
