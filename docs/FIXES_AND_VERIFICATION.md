# Fixes and verification — 20 October 2026

The original audit is a historical snapshot. This document records the subsequent implementation and its limits.

Latest release: [1.7.5 stacking and label sizing](STACKING_1.7.5.md): sticky headers, scroll-pane clipping, non-wrapping labels, actual Figma paste verification and 238 passing tests.

Previous release: [1.7.4 web-font matching](FONTS_1.7.4.md): accessible original font data, mixed styles, variable weights, explicit fallbacks, actual Figma editing checks and 234 passing tests.

Previous release: [1.7.3 responsive export and cancellation](RESPONSIVENESS_1.7.3.md): cooperative encoding, popup and on-page cancellation, serializer equivalence checks, 222 passing tests.

Previous release: [1.7.2 performance audit](PERFORMANCE_1.7.2.md): bounded text caches, large-page export measurements, cancellation and capture-limit stress checks, 209 passing tests. Includes [1.7.1 capture recovery](QUALITY_1.7.1.md) and the user-reported installed real-site success.

Earlier follow-up: [1.7.0 paragraph and nested sizing verification](QUALITY_1.7.0.md), including actual Figma web edits and resizing, 181 passing tests and browser evidence at two widths.

## Implemented

- Element selection retains the clicked target, including a click without prior hover. Keyboard selection, Esc cancellation and listener cleanup are covered by tests. Highlighting uses a separate overlay instead of changing webpage outlines.
- Viewport/full-page/selected captures have explicit origin, dimensions and clipping. Selected images use their own dimensions. Total generated nodes and traversal depth are bounded. The asynchronous capture path yields between batches and responds to cancellation.
- Capture reports completion, asset failures, timeout and storage errors in-page. Storage is awaited and bounded by serialized byte size. Shortcuts/context menus inject the content script when needed and report status via toolbar badges.
- Asset embedding uses a four-worker queue, URL cache, per-image and per-capture budgets, streaming byte checks, image MIME checks, abort/timeout handling and failure warnings.
- Import uses Figma's base64 decoder, caches decoded raster images, sizes SVG vectors, preserves image visibility/opacity, applies nonuniform radii and per-edge stroke widths, and uses canvas/poster fallbacks. LINE nodes are supported.
- Regular weight 400 maps to Regular. Font resolution is cached, including fallbacks, and substitutions are reported. Text uses explicit captured dimensions and fixed text boxes.
- Auto Layout uses fixed frame sizing. After reconstruction, inferred layout is retained only if child geometry agrees with measured browser positions; otherwise the captured positions are restored. Capture avoids inference on ambiguous flows such as reversed/wrapped flex layouts, margins, positioned children and background image children.
- Contrast uses inherited backgrounds instead of the foreground itself. Text colors are counted once. Transparency is composited for plain backgrounds and complex backgrounds receive uncertain results.
- Captured/imported strings render as text rather than HTML in inspector, popup and importer. Nested Figma payload fields, enums, numbers, colors and size/depth budgets are checked before import.
- Imports are serialized and cancellable. Created nodes are tracked and removed if import fails/cancels. Successful output is centered and selected.
- Importer adds manual JSON paste, file/clipboard recovery, capture review, dimensions, warnings, disabled busy controls, a cancel control and Figma theme variables.
- Popup adds truthful plugin workflow guidance, source identity/time, capture warnings, actual inferred-layout counts, reset empty states, keyboard tabs, native color-copy buttons, focus/disabled states and local-capture deletion. Secondary formats are grouped under More export formats.
- Chrome/Figma manifests and output packages are separate. Stale plugin files from old mixed Chrome builds are removed during extension builds. Documentation now describes implemented behavior. CI checks tests, types and builds.
- Test tooling was upgraded to Vitest 5.0.5 and compatible esbuild 0.28.2. Happy DOM was added for DOM and UI regression tests. npm reported zero vulnerabilities after installation.

## Transfer and embedded-preview follow-up

- Figma keyboard paste remains available when automatic clipboard reads are blocked. Import responses match request IDs, and stalled font loading times out or cancels with rollback.
- Successful copy removes capture feedback; the popup automatically copies and closes. Old captures dominated by an iframe placeholder are rejected with recapture instructions.
- Browser frame capture uses private extension messaging for scene data, token identification, nesting limits, cancellation and timeouts. Fallback script injection now includes permitted child frames and checks top-frame connectivity explicitly.
- Selected shadow hosts now discover their own embedded frames. Editing reviewed JSON invalidates the pending import. UI iframe checks now ignore hidden subtrees consistently with the importer, and completed imports ignore late replies.
- Automated checks cover these paths. Real installed-extension cross-origin capture and actual Figma rendering remain unverified in this follow-up.

## Verification performed

- **166 tests across 22 files pass**, up from 32 utility tests. Includes content-script interaction tests, actual capture-to-importer pipeline tests, malformed/cyclic payloads, asset budgets, cancellation, rollback and literal rendering of HTML-like strings.
- `npm run typecheck -- --force` passes.
- `npm run build` produces both application bundles.
- Real-browser smoke tests exercised viewport, full-page and selected-element captures through the rebuilt content script with mocked Chrome storage/messaging. Verified outputs were 1280×720 viewport, 1280×2232 loaded page and 360×36 selected heading. This is real browser DOM extraction, not installed-extension acceptance.
- Browser review verified importer manual paste, review state, dimensions and warnings. Both UIs were visually inspected at 380px/440px panel widths. [Saved preview](interface-preview.png).
- Synthetic throughput benchmark on Node v24.14.0/macOS, five runs each: 100 source elements → 102 output nodes, median 5ms/max 9ms; 1,000 → 1,002 nodes, median 35ms/max 38ms; 2,500 → bounded 2,500 nodes, median 80ms/max 94ms. This uses Happy DOM with supplied geometry. It does **not** measure browser layout, network, production-site capture or real Figma performance.

## Remaining product gaps and host checks

This is not a claim of universal correctness or exact competitor parity:

- **Native clipboard delivery is implemented but real Figma acceptance remains unverified.** The extension uses OpenPencil 0.16.0 to write native Kiwi clipboard HTML. Tests decode and inspect the binary structure; this does not prove rendering in Figma. JSON import remains an optional legacy fallback.
- **Actual installed-extension and Figma canvas smoke tests remain unverified.** An attempt to access the running Figma application was blocked because computer-use permissions were not granted. Automated importer tests use a Figma API mock, not the real rendering engine.
- Browser DOM and Figma typography differ, particularly for mixed inline text wrapping, font availability, ligatures, custom font faces and complex writing modes. Existing width/weight fixes do not guarantee exact line metrics.
- CSS transforms, paint/stacking order, blend modes, masks, advanced gradients/filters, complex decorative pseudo-elements, some background sizing/positioning and object-fit:none remain incomplete or approximate. Captured ::before text uses approximate geometry; ::after/decorative generated content is not fully reconstructed. Some of these conditions now produce warnings; not every unsupported CSS feature is detected.
- Shadow-root children are traversed, but distributed slot content is not fully modeled. Permitted embedded iframes can now be captured through extension messaging; inaccessible frames remain placeholders. Lazy/virtualized sections require loading before capture; the tool does not crawl hidden responsive states.
- Firefox packaging, account/billing services, usage plans, capture history and responsive device emulation are not implemented.
- Accessibility has improved, but no screen-reader conformance audit or full WCAG certification was performed. The contrast panel evaluates supported captured text and reports uncertain backgrounds.

## Manual acceptance steps

1. Reload the unpacked extension and test page after building; otherwise an old injected script can remain active.
2. Open `fixtures/browser-smoke.html` to rerun the browser-DOM harness, then use the installed extension on `fixtures/test-site/index.html` through localhost. Capture viewport at nonzero scroll, full page and a selected card/image. Confirm completion and stored JSON from each entry point, including keyboard shortcuts and context menus.
3. Restart the Figma development plugin using the rebuilt manifest. Import via clipboard, manual paste and file. Confirm text editing/wrapping, images, bounds, layout, colors, border sides, clipping and warnings against the browser.
4. Cancel a large capture/import and verify that the page responds and no incomplete Figma nodes remain. Try invalid JSON and unavailable images/fonts, then retry a valid import.
5. Compare target production websites at representative desktop/mobile widths. Record Figma/Chrome versions and screenshot differences before treating visual fidelity as accepted.

## Native clipboard follow-up (version 1.1.0)

The user-supplied fresh Magic Patterns capture contained 67 wrapper nodes and an uncaptured iframe, with a two-second identity timeout. Its design layers cannot be recovered from that JSON. The extension now prepares scripts in permitted frames before identification, retries identification while waiting, declares explicit host permissions and exposes the actual frame-access error. This implementation still needs installed-browser verification on the target preview.

The primary export now writes native Figma HTML clipboard data rather than JSON text. It serializes editable hierarchy, text metadata, image blobs, basic SVG geometry, paints, effects, radii and compatible fixed-size Auto Layout. Manual JSON import is no longer required. No remote conversion service, Figma account token or backend is used.

Native tests round-trip clipboard HTML through the decoder and inspect hierarchy, editable text, transforms, image blobs, vector geometry, and matching/mismatching Auto Layout. Type checking and both builds pass. Computer use was denied when attempting real Figma acceptance in this session, so actual canvas compatibility and font rendering remain unverified.

## Visible text, stroked icons and measured layout (version 1.2.0)

The user's Figma screenshots established that version 1.1.0 encoded the text strings but pasted without visible text and stroked icons. Binary round-trip tests were insufficient to catch that. The exporter had no text shaping runtime and used SVG centerlines as stroke render geometry. CSS-only, geometry-gated Auto Layout inference also excluded ordinary block layouts and unequal gaps.

- Native TEXT nodes now contain font-shaped glyph outlines, baselines, character offsets and text-decoration geometry, with the original editable strings retained. Bundled OFL Inter faces cover weights 100–900 in regular and italic styles. Other font families use Inter and produce a substitution warning. This is a font-fidelity limit, not a claim of exact original-font reproduction. An export with nonempty text and no drawable glyphs now fails instead of copying a blank result.
- SVG stroke render geometry is now an offset silhouette with cap/join handling. The editable vector network is retained separately; SVG cap/join properties are captured. Curves are sampled for stroke outlines.
- Aligned, non-overlapping rows/columns can derive native Auto Layout from measured geometry even without CSS flex metadata. Unequal gaps use editable flow spacers. Overlapping content retains absolute positioning.
- Native regression tests check real glyph blobs across weights/styles, baselines, nonzero stroke thickness, editable vector topology, measured gap/spacer handling, and overlap rejection. A browser-targeted build also passes a Node VM probe with dynamic code generation and Wasm disabled. This verifies dependency/runtime compatibility, not actual Chrome or Figma UI rendering. Run it with `node scripts/probe-native-browser.mjs`.
- Actual Figma visual acceptance remains unverified because computer-use access was denied. The fixes need a new capture/paste through the 1.2.0 extension, followed by comparison in Figma at matching viewport dimensions.

## Browser text-fragment preservation (version 1.2.1)

A user screenshot exposed a heading wrapped over its subtitle and a mixed-weight privacy paragraph with overlapping runs. Capture now preserves per-line character ranges and measured fragment geometry. Native export uses these positions and fits widths rather than rewrapping with fallback metrics. Line-relative caret offsets are also corrected. Existing saved captures need a fresh capture to gain this metadata.

102 tests, type checking, both builds and the browser-targeted VM probe pass. A real Chromium DOM→native-data fixture verified one heading line and an inline continuation starting at X=229.390625 then X=0, with 24px baseline spacing. Actual corrected Figma rendering is not yet verified. See [detailed visual review](VISUAL_REVIEW_1.2.1.md).

## Browser extension follow-up (version 1.3.0)

Successful native copying now conditionally clears the matching capture through a serialized background storage queue. Copy errors preserve retry data; newer captures and delayed startup responses cannot be erased or restored accidentally. The toolbar distinguishes copied output from a capture saved for retry. The native encoder loads into the requesting frame on demand, reducing the passive content script from about 2.2 MB to 75.3 KB.

Nested measured flows now tolerate absolute decorations and group regular wrapped rows into editable Auto Layout row frames. Export counts reflect actual encoded layers/layout frames. The popup has a new restrained interface, clear capture scopes, source identity, progressive details, cancellation, accessible focus states and explicit recovery.

127 tests across 18 files, forced type checking, both builds and the no-eval/no-Wasm native VM probe pass. Browser UI checks used the built popup at 392 × 600 with mocked Chrome/clipboard APIs and real native encoding. Success clears the saved fixture; failure preserves it and enables retry. Actual installed-extension and Figma canvas rendering remain separate acceptance checks. See the [full browser audit](BROWSER_EXTENSION_AUDIT_1.3.0.md).

## Image encoding, gradients and measured layout — 1.4.0

Fixed the CROP enum failure at the native serialization boundary. Added aspect-correct linear gradients, common radial gradients, layered fills, CSS stop fix-up, modern colours, premultiplied alpha and sampled modern interpolation. Auto Layout supports differing insets and visual ordering. 141 tests across 19 files, forced type checking, both builds and the browser VM probe pass. Eight real-browser DOM/decoded-paint comparisons were visually checked. Figma canvas rendering and Outlook host acceptance remain separate checks. See the [1.4.0 audit](BROWSER_EXTENSION_AUDIT_1.4.0.md).

## Image recovery, paragraphs and subpixel layout — 1.5.0

Added bounded extension image retries, same-origin page sessions, portable raster conversion and readable-loaded-image fallback. Eligible paragraphs consolidate into one rich TEXT layer. Capture preserves fractional geometry and virtual display:contents bounds; native layouts support reordered/uneven wrapped rows. 159 tests, forced type checking, both builds and the VM probe pass. A browser fixture verified one paragraph, four measured lines, 14 Auto Layout frames and two embedded PNGs, including real CORS failure and local simulated-broker recovery. See the [1.5.0 audit](BROWSER_EXTENSION_AUDIT_1.5.0.md) for evidence and acceptance limits.

## Screenshot paint fidelity — 1.6.0

Normalized border/SVG paint alpha, removed four-edge paint stacking, fixed modern shadow parsing, added local SVG gradient definitions and rounded/cutout geometry, retained simple backdrop blur and corrected form-control capture. 166 tests, forced types, builds and the browser VM probe pass. Chromium capture/encoding checks passed; exact production-site and Figma rendering remain acceptance work. See the [screenshot review](SCREENSHOT_REVIEW_1.6.0.md).
