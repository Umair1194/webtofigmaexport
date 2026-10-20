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
   - Capture → native clipboard → canvas paste, then inspect real editable layers. The JSON importer has separate legacy coverage.

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
   - Choose **Choose element** and hover over a card. Verify hover outline appears.
   - Click to capture. Native layers are automatically copied and the matching saved capture is cleared. A failed copy preserves the capture for **Copy to Figma** retry.
4. **Import in Figma**:
   - Open Figma desktop or web. Open any design file.
   - Close the FrameForge importer if it is open. Focus the canvas and press **⌘V / Ctrl+V**.
   - Confirm that a design hierarchy appears rather than JSON text, one image, or an empty frame.
5. **Verify Fidelity**:
   - **Text**: Double-click text layers to confirm they are editable native `TextNode` instances with correct font sizes, line heights, and colors.
   - **Auto Layout**: Inspect card frames to verify `Auto Layout` is applied with proper padding and item spacing.
   - **Shapes & Radius**: Verify corner radii and stroke borders match the web page.
   - **Images**: Verify images render properly inside frames.
   - **Capture warnings**: Review export notes before choosing Done; successful captures are no longer retained after copying. For embedded previews, allow extension site access to both origins and repeat the capture after refreshing the page.

## Post-audit regression suite

The suite now includes content-script interaction tests, capture output → importer tests, import cancellation/rollback, payload budgets, asset streaming limits, accurate contrast and UI text escaping. `node scripts/audit-probes.mjs` runs focused regression checks; it replaces the old defect-confirmation probes. `node scripts/benchmark-capture.mjs` measures synthetic DOM throughput only. See [current verification](FIXES_AND_VERIFICATION.md) for results and remaining manual acceptance work.

## Repeated `manifest.api` error despite importing the correct plugin

Figma can retain more than one local development entry. In the reported local setup, its saved `localFileExtensions` list contained both `apps/figma-plugin/manifest.json` (valid) and `apps/chrome-extension/manifest.json` (invalid for Figma). The latter can continue producing manifest errors even after the correct plugin is imported.

In Figma's development-plugin manager, remove the obsolete entry whose manifest path is `apps/chrome-extension/manifest.json`. Keep `apps/figma-plugin/manifest.json`. Restart Figma and run the retained development plugin. Do not add Figma-only fields to the Chrome manifest to silence this error. Removing a development registration does not require deleting the project or Figma document.

## Version 1.3.0 lifecycle and UI checks

After rebuilding, reload the extension and source page. Verify viewport, full loaded page, element selection, shortcut and context-menu capture. Confirm that a successful native copy clears the saved capture, while denied clipboard access keeps it for retry. Capture in two tabs and confirm copying an older capture does not delete a newer one. Check duplicate-click locking, cancellation, unavailable pages, storage errors and keyboard navigation through scopes and details. Confirm actual pasted row frames have Auto Layout while positioned badges stay absolute.

Run `node scripts/preview-extension.mjs` and open the localhost URL it prints for the isolated popup UI harness. `?state=empty`, `?state=ready` and `?state=failure` exercise the built popup. Chrome APIs and clipboard writes are mocked; the native encoder is real. This harness neither installs the extension nor proves Figma host acceptance. Run `node scripts/probe-native-browser.mjs` after building for the browser-targeted encoder runtime check.

## Gradient and image-mode checks — 1.4.0

Run `node scripts/preview-gradients.mjs` for eight browser DOM → native encoder → decoder paint comparisons. Inspect the CSS/SVG pairs and completion report; this does not launch Figma or write the clipboard. In the installed extension, test ordinary object-fit:fill/contain/cover images, flows with differing insets and gradient-heavy pages. Confirm service-worker wake-up by waiting for Inactive in chrome://extensions, then capturing from the popup or shortcut; idle termination itself is expected.

## Capture quality — 1.5.0

After building, run `node scripts/preview-capture-quality.mjs`. The two-origin Chromium fixture checks actual DOM capture, styled paragraph consolidation, native encoding, CORS fallback and WebP conversion. Chrome messaging uses a local test broker; no clipboard write or Figma action occurs. For installed acceptance, reload the extension/source page, capture CDN images and same-origin session images, then verify actual Figma image fills, a single rich paragraph text layer and nested display:contents/grid flows. Cancellation must stop owned broker downloads; protected-image failures must retain useful warnings.

## Screenshot paint fidelity — 1.6.0

Run `node scripts/preview-paint-fidelity.mjs` for the Chromium capture/encoder fixture. Inspect soft borders, modern-colour shadows, SVG gradient/cutout geometry, input padding, checkbox state and backdrop blur. The report verifies decoded native data; the screenshot is source HTML, not Figma rendering. Reload the installed extension and source pages before making production comparisons at matched viewport sizes.
