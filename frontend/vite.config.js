import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// Large libraries get their own chunks: a page only downloads what it uses,
// and they stay cached across app updates (they change far less often).
const VENDOR_CHUNKS = [
  ["vendor-react", ["react", "react-dom", "react-router", "react-router-dom", "scheduler"]],
  ["vendor-cytoscape", ["cytoscape", "cytoscape-context-menus", "cytoscape-edge-editing"]],
  ["vendor-konva", ["konva"]],
  ["vendor-charts", ["recharts", "d3-", "victory-vendor"]],
  ["vendor-maps", ["leaflet", "react-leaflet", "@react-leaflet"]],
  ["vendor-pdf", ["jspdf", "html2canvas", "canvg", "dompurify"]],
  ["vendor-zip", ["jszip"]],
  ["vendor-data", ["dexie", "zod", "immer", "zustand", "date-fns"]],
  ["vendor-dnd", ["@dnd-kit"]],
  ["vendor-icons", ["lucide-react"]],
];

const chunkFor = (id) => {
  const at = id.lastIndexOf("node_modules/");
  if (at === -1) return undefined;
  const path = id.slice(at + "node_modules/".length);
  for (const [name, packages] of VENDOR_CHUNKS) {
    if (packages.some((pkg) => path.startsWith(pkg.endsWith("-") ? pkg : `${pkg}/`) || path === pkg)) return name;
  }
  return undefined;
};

// public/ may still hold the full design icon library (design source files);
// the app only uses the copies in public/icons, so keep the rest out of the
// build. (Moving it to design-assets/ makes this a no-op.)
const DESIGN_ONLY = ["All Icons Zipped"];
const dropDesignFiles = () => ({
  name: "drop-design-files",
  apply: "build",
  async closeBundle() {
    await Promise.all(DESIGN_ONLY.map((dir) => rm(resolve("dist", dir), { recursive: true, force: true })));
  },
});

export default defineConfig({
  plugins: [react(), dropDesignFiles()],
  server: {
    port: 5173,
  },
  build: {
    // The largest chunk is the PDF library (~720 kB), which is only fetched
    // when someone exports a PDF (dynamic import); page chunks stay < 500 kB.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks: (id) => chunkFor(id.replace(/\\/g, "/")),
      },
    },
  },
});
