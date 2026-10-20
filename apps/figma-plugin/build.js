import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distDir = path.join(__dirname, "dist");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy ui.html to dist/ui.html
fs.copyFileSync(path.join(__dirname, "src", "ui.html"), path.join(distDir, "ui.html"));

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [path.join(__dirname, "src", "code.ts")],
  bundle: true,
  outfile: path.join(distDir, "code.js"),
  target: "es2020",
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
  alias: {
    "@frameforge/scene-graph": path.resolve(repoRoot, "packages/scene-graph/src/index.ts"),
    "@frameforge/style-normalizer": path.resolve(repoRoot, "packages/style-normalizer/src/index.ts"),
    "@frameforge/dom-capture": path.resolve(repoRoot, "packages/dom-capture/src/index.ts"),
    "@frameforge/asset-pipeline": path.resolve(repoRoot, "packages/asset-pipeline/src/index.ts"),
    "@frameforge/shared-protocol": path.resolve(repoRoot, "packages/shared-protocol/src/index.ts"),
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching Figma plugin code...");
} else {
  await esbuild.build(buildOptions);
  console.log("Figma plugin built successfully in dist/.");
}
