import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distDir = path.join(__dirname, "dist");
const publicIconsDir = path.join(__dirname, "public/icons");
const distIconsDir = path.join(distDir, "icons");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy manifest.json and popup.html to dist/
fs.copyFileSync(path.join(__dirname, "manifest.json"), path.join(distDir, "manifest.json"));
fs.copyFileSync(path.join(__dirname, "popup.html"), path.join(distDir, "popup.html"));

// Copy icons
if (fs.existsSync(publicIconsDir)) {
  if (!fs.existsSync(distIconsDir)) {
    fs.mkdirSync(distIconsDir, { recursive: true });
  }
  for (const file of fs.readdirSync(publicIconsDir)) {
    fs.copyFileSync(path.join(publicIconsDir, file), path.join(distIconsDir, file));
  }
}

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [
    { in: path.join(__dirname, "src/background/background.ts"), out: "background" },
    { in: path.join(__dirname, "src/content/content.ts"), out: "content" },
    { in: path.join(__dirname, "src/popup/popup.ts"), out: "popup" },
  ],
  bundle: true,
  outdir: distDir,
  target: "es2022",
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
  console.log("Watching Chrome extension...");
} else {
  await esbuild.build(buildOptions);
  console.log("Chrome extension built successfully in dist/.");
}
