# FrameForge Verification & Testing Plan

This document outlines the testing strategy, test fixtures, unit tests, integration verification, and manual Figma canvas validation steps.

---

## 1. Test Architecture

The verification suite spans four tiers:

1. **Unit Tests (`packages/*`)**:
   - `packages/scene-graph`: Schema validation, invalid payload rejection, node tree integrity.
   - `packages/style-normalizer`: Color parsing, RGBA/HEX/HSL/OKLCH conversions, WCAG 2.1 contrast math with uncertainty detection, Tailwind token matching, box-shadow and border-radius normalization.
   - `packages/dom-capture`: Flexbox Auto Layout inference, coordinate transforms, sensitive form redaction.
   - `packages/asset-pipeline`: Asset deduplication, content hashing, URL resolution.
2. **Component & Fixture Tests (`fixtures/test-site`)**:
   - Comprehensive HTML/CSS fixture page including:
     - Hero section with gradient backgrounds and responsive typography.
     - Auto Layout flexbox button groups and card grids.
     - Images with `object-fit: cover` and borders.
     - Inline SVG icons and vector badges.
     - Sensitive form inputs (password, credit card, text).
     - Overlapping elements, drop shadows, and border radii.
     - Hidden elements (`display: none`, `visibility: hidden`).
     - Deeply nested DOM nodes to verify performance and non-recursive safety.
     - Cross-origin iframe to verify honest fallback diagnostics.
3. **Build & Typecheck Automation**:
   - TypeScript strict mode typechecking across all workspaces.
   - Bundling of Chrome Extension and Figma Plugin.
4. **Manual Figma Canvas Verification**:
   - Step-by-step instructions for loading the companion plugin in Figma and inspecting real editable layers.

---

## 2. Running Automated Tests

```bash
# Run all unit tests
npm test

# Run TypeScript typechecks across all packages and apps
npm run typecheck

# Build extension and Figma plugin
npm run build
```

---

## 3. Manual Figma Verification Protocol

1. **Launch Test Site**:
   - Serve `fixtures/test-site/index.html` via local HTTP server (or open directly).
2. **Load Chrome Extension**:
   - Open `chrome://extensions`, enable **Developer mode**.
   - Click **Load unpacked** and select `apps/chrome-extension/dist`.
3. **Capture**:
   - Navigate to the fixture site.
   - Click the FrameForge extension icon.
   - Choose **"Selected Element"** and hover over a card. Verify hover outline appears.
   - Click to capture. Click **"Copy for Figma"** in the popup.
4. **Import in Figma**:
   - Open Figma desktop or web. Open any design file.
   - Open **Plugins** -> **Development** -> **Import plugin from manifest...** and select `apps/figma-plugin/manifest.json`.
   - Run the **FrameForge** plugin.
   - Click **"Import from Clipboard"**.
5. **Verify Fidelity**:
   - **Text**: Double-click text layers to confirm they are editable native `TextNode` instances with correct font sizes, line heights, and colors.
   - **Auto Layout**: Inspect card frames to verify `Auto Layout` is applied with proper padding and item spacing.
   - **Shapes & Radius**: Verify corner radii and stroke borders match the web page.
   - **Images**: Verify images render properly inside frames.
   - **Summary Report**: Confirm that the import dialog shows layer count, text count, and any font substitution notes.
