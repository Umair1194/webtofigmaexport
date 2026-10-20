import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [{ name: "font-bytes", enforce: "pre", load(id) { if (id.endsWith(".woff2")) return "export default new Uint8Array(" + JSON.stringify([...fs.readFileSync(id)]) + ");"; } }],
  resolve: {
    alias: {
      "@frameforge/scene-graph": path.resolve(__dirname, "packages/scene-graph/src/index.ts"),
      "@frameforge/style-normalizer": path.resolve(__dirname, "packages/style-normalizer/src/index.ts"),
      "@frameforge/dom-capture": path.resolve(__dirname, "packages/dom-capture/src/index.ts"),
      "@frameforge/asset-pipeline": path.resolve(__dirname, "packages/asset-pipeline/src/index.ts"),
      "@frameforge/shared-protocol": path.resolve(__dirname, "packages/shared-protocol/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
