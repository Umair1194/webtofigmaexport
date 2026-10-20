import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
