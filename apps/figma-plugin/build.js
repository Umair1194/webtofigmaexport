import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distDir = path.join(__dirname, "dist");
const chromeDistDir = path.resolve(repoRoot, "apps/chrome-extension/dist");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy ui.html to dist/ui.html
fs.copyFileSync(path.join(__dirname, "src", "ui.html"), path.join(distDir, "ui.html"));

// Also generate dist/manifest.json so importing from dist/ works seamlessly
const distManifest = {
  name: "FrameForge: Web to Editable Figma",
  id: "135792468012345678",
  api: "1.0.0",
  main: "code.js",
  ui: "ui.html",
  editorType: ["figma"],
};
fs.writeFileSync(path.join(distDir, "manifest.json"), JSON.stringify(distManifest, null, 2));

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
  // Also copy code.js and ui.html into chrome-extension dist/ so even if Chrome's dist manifest is opened in Figma, it succeeds!
  if (fs.existsSync(chromeDistDir)) {
    fs.copyFileSync(path.join(distDir, "code.js"), path.join(chromeDistDir, "code.js"));
    fs.copyFileSync(path.join(distDir, "ui.html"), path.join(chromeDistDir, "ui.html"));
  }
  console.log("Figma plugin built successfully in dist/.");
}
