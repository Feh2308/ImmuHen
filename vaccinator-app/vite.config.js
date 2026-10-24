import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(value) {
  const rawValue = String(value || "/").trim();

  if (!rawValue || rawValue === "/") {
    return "/";
  }

  return `/${rawValue.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
});
