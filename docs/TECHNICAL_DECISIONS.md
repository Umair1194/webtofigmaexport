# FrameForge: Technical Decisions & Feasibility Findings

## 1. Direct-Paste Hypothesis vs. Companion Figma Plugin

### Hypothesis Tested
*Can an external Chrome Extension write a clipboard payload that Figma will natively paste as editable Frames, Auto Layout containers, real TextNodes with styles, shapes, and images without requiring a Figma plugin?*

### Empirical Testing & Results

| Clipboard MIME Type / Format | Figma Paste Behavior | Native Editable Layers? | Auto Layout Supported? | Text Editable as Real Text? | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text/plain` | Pastes a single flat `TextNode` with the raw text content. | ❌ No | ❌ No | Only as 1 raw block | Unusable for web capture |
| `text/html` | Figma parses basic typography (`<h1>-<h6>`, `<p>`) and tables. All CSS positioning, flex/grid, borders, shadows, background images, and layout hierarchy are stripped. | ❌ No (flat text/table) | ❌ No | Partial (rich text only) | Unusable for design reconstruction |
| `image/svg+xml` | Figma parses SVG tags into `VectorNode` and `GroupNode` layers. | ⚠️ Partial (vector shapes only) | ❌ No | ⚠️ Very poor (SVG text turns into paths or unflowed characters) | Acceptable only as a **fallback** |
| Proprietary Figma Internal Clipboard | Figma desktop/web uses an internal, undocumented binary/encoded schema (`<meta charset='utf-8'><span data-metadata="...">` or internal protobuf). | ⚠️ Fragile & Undocumented | Unknown | Unknown | **Rejected**: Violates stability rules, breaks on Figma releases, violates API terms |
| **Figma Plugin API** (`figma.createFrame`, `figma.createText`, `figma.createImage`, etc.) | Creates genuine `FrameNode`, `TextNode`, `RectangleNode`, `VectorNode`, and `ImagePaint` with Auto Layout, effects, strokes, and loaded fonts. | ✅ **100% Native & Robust** | ✅ **Full Auto Layout** | ✅ **Full Typography & Loaded Fonts** | **Chosen Primary Path** |

### Decision
1. **Primary Delivery Path**: Chrome Extension extracts the webpage into a versioned, validated Scene Graph JSON and writes it to the clipboard (or saves a `.figma-scene.json` file). The user opens the **FrameForge Companion Plugin** in Figma and clicks **"Import Scene from Clipboard"** (or drops the file). The plugin executes native Figma API commands to reconstruct the exact canvas hierarchy with Auto Layout.
2. **One-Click Fallback**: The extension also provides **"Copy as SVG"** for users who desire an instant paste without opening a plugin, clearly labeled with its limitations (no Auto Layout, vector text).
3. **Screenshot Fallback**: Provides **"Copy Screenshot"** as a raster reference image.

---

## 2. Monorepo & Build Tooling

- **Workspace Manager**: npm workspaces (native to Node 24/npm 11, zero global dependencies required).
- **Extension Framework**: Vite + TypeScript targeting Chrome Manifest V3.
- **Figma Plugin Bundler**: Vite / TypeScript producing standard Figma plugin bundle (`manifest.json`, `dist/code.js`, `dist/ui.html`).
- **Test Framework**: `vitest` for rapid TypeScript unit testing and DOM simulation.

---

## 3. DOM Traversal & Layout Strategy

- **Coordinate System**: All positions and dimensions are captured in **CSS Pixels** (`window.innerWidth`, `getBoundingClientRect()`), strictly avoiding unintentional device-pixel ratio scaling.
- **Layout Inference**:
  - Confident Flexbox (`display: flex`) containers are mapped to Figma Auto Layout (`layoutMode = "HORIZONTAL" | "VERTICAL"`).
  - Unaligned, complex multi-column grids or ambiguous nested layouts fall back to absolute positioning (`layoutMode = "NONE"`) with exact CSS pixel coordinates to guarantee 100% visual fidelity.
- **Font Strategy**:
  - Importer extracts requested font families.
  - Importer awaits `figma.loadFontAsync({ family, style })`.
  - If a font is not installed on the user's system or Figma font catalog, it falls back to `Inter` (Regular/Bold) or `Roboto` and adds a warning to the import summary.

---

## 4. Privacy & Data Handling

- **Form Redaction**: Form values (`<input value="...">`, password fields, payment fields) are redacted by default. Only the placeholder, styling, and geometry are serialized.
- **Local-Only**: No external API or telemetry is bundled. All compute is performed on the user's browser and Figma desktop/web sandbox.

---

## 5. Unresolved Technical Risks & Mitigations

1. **Cross-Origin iframes**:
   - *Risk*: Webpages with cross-origin `<iframe>` elements (e.g. YouTube embeds, payment gateways) cannot be queried via DOM API due to browser SOP (Same-Origin Policy).
   - *Mitigation*: Honest diagnostics in `docs/LIMITATIONS.md`. Capture the iframe bounding box and render an `UnsupportedNode` labeled "Cross-origin iframe restricted".
2. **Very Deep DOM trees**:
   - *Risk*: Highly complex pages (>5,000 DOM nodes) can freeze the UI during capture or Figma import.
   - *Mitigation*: Iterative traversal with node limit guard (default max 2,500 visible nodes), chunked processing with `requestAnimationFrame` yielding, and visible progress indicators.
3. **CORS Protected Images**:
   - *Risk*: Images loaded from CDNs without `Access-Control-Allow-Origin: *` may fail canvas `toDataURL()` conversion.
   - *Mitigation*: Attempt `fetch()` with credentials omit; if blocked, preserve image URL and dimensions, and log a friendly warning in the asset catalog.
