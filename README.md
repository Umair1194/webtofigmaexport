# FrameForge — Web to Editable Figma

A Manifest V3 Chrome extension. Capture a viewport, full loaded page or selected element, then paste directly onto the Figma canvas as editable layers.

**The primary workflow requires no Figma plugin.** “Copy to Figma” writes native Figma binary clipboard data as HTML. Paste onto the canvas with ⌘V / Ctrl+V. Text, frames, supported vector shapes, embedded images and compatible Auto Layout stacks remain editable. Fixture captures have been checked in Figma web, including text edits and nested resizing; this does not guarantee fidelity on arbitrary sites. See [1.7.0 verification](docs/QUALITY_1.7.0.md).

## Build and test

Use Node.js 24 and npm:

```sh
npm ci
npm run typecheck -- --force
npm test
npm run build
```

The regression suite covers capture bounds, element picking, cancellation, storage failures, asset limits/deduplication, nested payload validation, contrast, importer text/image properties, rollback and UI escaping. Host APIs are mocked in automated tests; actual Chrome/Figma smoke testing remains required. GitHub Actions runs these checks and uploads both application builds.

## Load the extension

1. Open `chrome://extensions` in Chrome or the equivalent page in a Chromium browser.
2. Enable Developer mode and choose **Load unpacked**.
3. Select `apps/chrome-extension/dist`.
4. After rebuilding, reload the extension and reload any test webpage to replace its existing content script. Version 1.7.2 includes nested text styling, paragraph wrapping boxes, eligible content-driven sizing, oversized-corner normalization, clearer incomplete-capture recovery, and faster repeated text exports; take a fresh capture to get these fixes. Saved captures still clear after copying. Existing host permissions support embedded-frame script preparation. Allow site access for the page and its preview origin (or all sites) in extension details.

## Optional legacy JSON importer

1. Run `npm run build`.
2. In Figma, choose **Plugins → Development → Import plugin from manifest**.
3. Select `apps/figma-plugin/manifest.json`, or the root `figma-manifest.json`.
4. Run **FrameForge: Web to Editable Figma**. Restart it after rebuilding.

The Chrome manifest is only for Chrome. Plugin and extension outputs are now packaged separately.

## Capture and import

1. Open a regular HTTP/HTTPS webpage.
2. Open the extension and choose **Visible area**, **Full page** or **Choose element**.
3. Click **Capture & copy**. For selection, click the element or use arrows/Enter; Esc cancels. In-page feedback reports completion or failure.
4. Successful native copying automatically clears the matching saved capture. The popup confirms completion, then closes; export notes remain visible until **Done**. Failed copies remain saved under **Copy to Figma** for retry. **Discard** clears them manually.
5. Focus the Figma canvas and press **⌘V / Ctrl+V**. No importer window or JSON paste is needed.
6. JSON and SVG remain optional diagnostic/fallback exports under **Details & other formats**.

Figma handles placement and font availability when pasting. The extension reports capture/conversion warnings. The optional legacy importer continues to support JSON, cancellation and rollback.

Capture is limited to 2,500 output nodes, depth 64, 2 MB per downloaded image, about 6 MB of embedded data URL characters and 8 MB of serialized JSON. Downloads use up to four concurrent requests, cache repeated URLs and time out; captures can be cancelled and have a 30-second overall deadline. The importer rejects invalid or oversized structures before creating layers.

## Fidelity and privacy

Text is editable and includes shaped glyph outlines so it can render on initial paste. Bundled Inter regular/italic faces support weights 100–900; other font families are substituted with a warning. Compatible flex, measured block flows and regular wrapped rows retain Auto Layout, with editable spacers for unequal gaps. Positioned badges and background layers remain absolute inside these frames. Overlapping content keeps measured positioning. Other layouts keep absolute positioning. Canvas snapshots and video posters are used when available. Image acquisition retries through the extension, converts browser raster formats to PNG and can reuse readable loaded images. Protected or inaccessible images can still remain placeholders. Eligible paragraphs retain one editable text layer with inline styles and measured wrapping.

There is no guarantee of pixel-perfect reproduction for arbitrary CSS. Transforms, complex generated content, advanced filters, embedded documents and some background/image behavior remain limited. Full page captures include currently loaded content; scroll first to load lazy sections. See [limitations](docs/LIMITATIONS.md).

Processing is local and no telemetry or account backend is implemented. Remote image embedding makes network requests to asset hosts. Input values are redacted, but ordinary page text, titles and URLs can contain private information. The latest capture is stored locally until a successful native copy clears it. Failed copies remain available for retry; **Discard** clears them manually. See [privacy](docs/PRIVACY.md).

## Audit and verification

- [Screenshot fidelity review — 1.6.0](docs/SCREENSHOT_REVIEW_1.6.0.md)
- [Performance audit — 1.7.2](docs/PERFORMANCE_1.7.2.md)
- [Incomplete-capture recovery — 1.7.1](docs/QUALITY_1.7.1.md)
- [Paragraph and resizing verification — 1.7.0](docs/QUALITY_1.7.0.md)
- [Images, paragraphs and nested layout audit — 1.5.0](docs/BROWSER_EXTENSION_AUDIT_1.5.0.md)
- [Gradient, image fitting and layout audit — 1.4.0](docs/BROWSER_EXTENSION_AUDIT_1.4.0.md)
- [Browser extension audit and UI changes — 1.3.0](docs/BROWSER_EXTENSION_AUDIT_1.3.0.md)
- [Original audit](docs/PRODUCT_AUDIT_2026-10-20.md)
- [Fixes, verification and remaining gaps](docs/FIXES_AND_VERIFICATION.md)
- [Testing guide](docs/TESTING.md)
- `node scripts/audit-probes.mjs` runs the focused regression checks.
- `node scripts/benchmark-capture.mjs` runs a synthetic DOM throughput benchmark.
- Serve this repository locally and open `fixtures/ui-preview.html` for interface previews. These previews cannot exercise Chrome or Figma APIs.
