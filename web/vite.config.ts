import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The .scad models live in ../models, shared with the CLI.
// BASE_PATH sets the path that the site lives under, for example /kallax/ on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [".."] } },
  worker: { format: "es" },
});
