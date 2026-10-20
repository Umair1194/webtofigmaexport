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

// Remove obsolete Figma files left by older mixed-package builds.
for (const name of ["code.js", "ui.html"]) { const stale = path.join(distDir, name); if (fs.existsSync(stale)) fs.unlinkSync(stale); }

// Copy manifest.json and popup.html to dist/
fs.copyFileSync(path.join(__dirname, "manifest.json"), path.join(distDir, "manifest.json"));
fs.copyFileSync(path.join(__dirname, "popup.html"), path.join(distDir, "popup.html"));

// Preserve redistribution notices for bundled native clipboard dependencies.
const clipboardPackages = ["@open-pencil/fig", "@open-pencil/kiwi", "@open-pencil/scene-graph", "@noble/hashes", "culori", "es-toolkit", "fflate", "fzstd", "js-base64", "nanoevents", "postcss-value-parser", "svgpath", "valibot", "@fontsource/inter", "fontkit", "buffer", "clipper-lib", "base64-js", "ieee754", "@swc/helpers", "tslib", "brotli", "clone", "dfa", "fast-deep-equal", "restructure", "tiny-inflate", "unicode-properties", "unicode-trie", "pako"];
const notices = [];
for (const name of clipboardPackages) {
  const directory = path.join(repoRoot, "node_modules", name);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  notices.push(name + " " + metadata.version + " (" + metadata.license + ")");
  if (name === "clipper-lib") notices.push(fs.readFileSync(path.join(directory, "clipper.js"), "utf8").split("(function ()")[0]);
  if (name === "fontkit") notices.push("Fontkit by Devon Govett — MIT License. https://github.com/foliojs/fontkit");
  for (const file of fs.readdirSync(directory).filter(file => /^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(file))) {
    if (fs.statSync(path.join(directory, file)).isFile()) notices.push(fs.readFileSync(path.join(directory, file), "utf8"));
  }
}
fs.writeFileSync(path.join(distDir, "THIRD_PARTY_NOTICES.txt"), notices.join("\n\n"));

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
    { in: path.join(__dirname, "src/clipboard/page-copy.ts"), out: "clipboard" },
    { in: path.join(__dirname, "src/background/background.ts"), out: "background" },
    { in: path.join(__dirname, "src/content/content.ts"), out: "content" },
    { in: path.join(__dirname, "src/popup/popup.ts"), out: "popup" },
  ],
  bundle: true,
  loader: { ".woff2": "binary" },
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
