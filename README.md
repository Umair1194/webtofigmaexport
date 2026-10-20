# FrameForge: Web to Editable Figma

**FrameForge** is an original, production-minded Chrome Extension and companion Figma Plugin that captures real web pages and reconstructs them into high-fidelity, natively editable Figma documents.

Unlike screenshot tracers or flat vector copiers, FrameForge produces:
- **True Semantic Hierarchy**: Native Figma `FrameNode`, `TextNode`, `RectangleNode`, `VectorNode`, and `ImageNode`.
- **Inferred Auto Layout**: Converts CSS Flexbox (`row`, `column`, `gap`, `padding`, alignment) into native Figma Auto Layout.
- **Editable Typography**: Real text nodes with font weight mapping (100–900), line height, letter spacing, alignment, and loaded font fallbacks.
- **Design Intelligence**: Color scanner (HEX, RGB, HSL, OKLCH, nearest Tailwind token), typography inventory, asset manifest, WCAG 2.1 contrast auditing, and `DESIGN.md` / `SKILL.md` export for AI coding agents.
- **Privacy & Security by Default**: 100% local processing, zero telemetry, and automatic redaction of sensitive form fields, passwords, and personal data.

---

## Architecture Overview

```text
export-web-to-figma/
├── apps/
│   ├── chrome-extension/       # Manifest V3 Extension (Popup, Content Scripts, Service Worker)
│   └── figma-plugin/           # Figma Companion Plugin (Canvas Importer Sandbox & UI)
├── packages/
│   ├── scene-graph/            # Versioned interchange schema (1.0.0) & validator
│   ├── style-normalizer/       # CSS to design tokens, color math, WCAG, Tailwind matcher
│   ├── dom-capture/            # In-page DOM traversal, layout inference, form redaction
│   ├── asset-pipeline/         # Asset extraction, deduplication, base64 encoding
│   └── shared-protocol/        # IPC messages, DESIGN.md & SKILL.md generators, SVG fallback
├── fixtures/
│   └── test-site/              # Comprehensive test bench covering all layout & style edge cases
└── docs/
    ├── ARCHITECTURE.md         # System design & data flow
    ├── TECHNICAL_DECISIONS.md  # Feasibility findings & clipboard test results
    ├── LIMITATIONS.md          # Documented browser & Figma boundaries
    ├── PRIVACY.md              # Privacy & security guarantees
    └── TESTING.md              # Testing strategy & verification protocol
```

---

## Getting Started

### 1. Install & Build
```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Build Chrome Extension and Figma Plugin
npm run build
```

---

### 2. Load the Chrome Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the directory:
   `apps/chrome-extension/dist`
5. The **FrameForge** icon will appear in your Chrome toolbar.

---

### 3. Load the Companion Plugin in Figma
1. Open **Figma** (Desktop or Web) and open any design canvas.
2. Go to **Plugins** -> **Development** -> **Import plugin from manifest...**.
3. Select the file:
   `apps/figma-plugin/manifest.json`
4. The **FrameForge: Web to Editable Figma** plugin will now be available in your development plugins list.

---

### 4. End-to-End Workflow Validation
1. Open the included test bench:
   Open `fixtures/test-site/index.html` in Chrome (or run `npx serve fixtures/test-site -p 3000`).
2. Click the **FrameForge** extension icon in your Chrome toolbar.
3. Select capture scope:
   - **Current Viewport**
   - **Full Page**
   - **Select Element** (hover highlight with Esc to cancel)
4. Click **"Capture Web Layers"**.
5. Click **"📋 Copy for Figma (1-Click)"** (or click "Save JSON").
6. In Figma, run the **FrameForge** plugin and click **"Import from Clipboard"** (or drop the saved `.json` file).
7. Inspect the reconstructed canvas:
   - Double click text to edit native characters.
   - Select card frames to see native **Auto Layout** with padding and item spacing.
   - Review the import summary card for node counts and font diagnostic notes.

---

## Documentation Links

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Component breakdown, monorepo design, data flow diagrams.
- [docs/TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md): Clipboard feasibility spike, direct-paste findings, and rationale for companion plugin.
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md): Cross-origin iframes, restricted Chrome pages, and font fallbacks.
- [docs/PRIVACY.md](docs/PRIVACY.md): Form redaction, minimal permissions, and zero-telemetry guarantee.
- [docs/TESTING.md](docs/TESTING.md): Verification test plan and manual Figma inspection steps.
