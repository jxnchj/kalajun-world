import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

// Dev-only endpoint: POST /__snapshot?name=foo (JPEG body) -> docs/snapshots/foo.jpg
const snapshotDir = path.resolve(import.meta.dirname, "../docs/snapshots");
const devSnapshot = {
  name: "dev-snapshot",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__snapshot", (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        return res.end();
      }
      const name = (new URL(req.url, "http://x").searchParams.get("name") || "shot").replace(/[^\w.-]/g, "_");
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        fs.mkdirSync(snapshotDir, { recursive: true });
        fs.writeFileSync(path.join(snapshotDir, `${name}.jpg`), Buffer.concat(chunks));
        res.end("ok");
      });
    });
  },
};

export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  plugins: [devSnapshot],
});
