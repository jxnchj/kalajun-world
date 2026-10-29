import {reachCoverPreparedPlugin42} from './reach-cover-prepared-binding42.js';
import {terrainPreparedBinding42} from './terrain-prepared-binding42.js';
import {meadowRootBinding} from './meadow-root-binding.js';
import {structurePreparedPlugin} from './structure-prepared-binding.js';
import {forestRootBinding} from './forest-root-binding.js';
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { builtPreview } from "./built-preview.js";
export default defineConfig({
  plugins: [reachCoverPreparedPlugin42(),terrainPreparedBinding42(),builtPreview(import.meta.dirname),forestRootBinding(),meadowRootBinding(),structurePreparedPlugin()],
  base: "./",
  server: {host: "127.0.0.1", port: 5174, strictPort: true},
  build: {target: "es2022", outDir: "dist-v2", emptyOutDir: true, chunkSizeWarningLimit: 1600, rollupOptions: {input: resolve(import.meta.dirname, "v2.html")}}
});
