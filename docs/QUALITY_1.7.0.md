# Paragraphs and nested sizing — 1.7.0

The Figma host baseline exposed lost deeply nested text styles, paragraphs that rewrapped on editing, and fixed descendants overflowing a resized parent. This release addresses those cases in fresh captures. It does not recreate every CSS layout or responsive breakpoint.

## Changes

- Paragraph consolidation preserves existing inner style runs, including UTF-16 offsets, weight and paint, when merging outer inline markup. Missing run spans retain the piece's base style.
- Eligible block paragraphs, including a single text child, use the actual content box instead of the painted line's tight bounds. Measured glyph fragments retain their offsets inside that box. Native text uses auto height; the optional JSON importer honours that flag too. Positioned/decorated inline content and nowrap/pre text retain conservative handling.
- Capture records available CSS Typed OM sizing intent and pixel min/max constraints. Native layout applies cross-axis Fill and proportional main-axis growth only when compatible with measured dimensions; explicit fixed sizes remain fixed. Eligible content-driven heights use Hug with the captured height as a minimum. This prevents initial font/stroke rounding from shrinking a fresh paste while allowing later growth.
- Inferred flex padding includes CSS borders. Without this, a 1 px border on either side left a 2 px content-width mismatch: frames could resize while their input/button children stayed fixed. Matching the actual inner box fixes the tested overflow.
- Extension/package/built manifest version is 1.7.0. No permissions or dependencies were added. Copy-success cleanup and the primary direct-paste workflow are unchanged.

## Verification

181 tests across 25 files pass, along with forced type checking, both builds, the browser-lab build, and the native encoder probe with eval/Function/Wasm disabled. Added regression cases cover repeated nested style merging, block content bounds, native style paints/auto height/min-max serialization, fixed-vs-flexible sizing, height guards and border insets.

Five browser scenarios passed at each of 1440 × 1000 and 768 × 1000 CSS pixels. The acceptance scenario explicitly checks a single paragraph layer, content-width/auto-height metadata, retained nested styling, nested Auto Layout, gradient presence and embedded images. Output layer counts match the earlier baseline at each width. Reports are saved under `quality-1.7.0/`.

The reports identify the checkout's parent revision plus extension version; this run includes the uncommitted 1.7.0 workspace changes, not an unchanged `43b4a73` source tree. The narrow report passes the comparison budget with no layer-count changes or flagged timing/payload increases. The timing comparator correctly refuses the original desktop report because its DPR differs from this run (2 versus 1); no desktop performance-regression pass is claimed. The new reports are references for future runs in the same environment.

### Actual Figma web checks

Used the user-provided design file and a new **FrameForge QA fixes · 1.7.0** page. The original QA baseline and existing design pages were preserved. Temporary draft captures on the fixes page were replaced by two final captures.

| Check | Observed result |
| --- | --- |
| Initial desktop/narrow geometry | 1120 × 503 px and 720 × 764.57 px respectively, matching selected source boxes |
| Deep nested rich text | Purple and bold both visible on the native editable text, at both widths |
| Paragraph reflow | Native paragraph reports 440 px width, Auto height, Inter 14 px / 21 px; restoring original text preserves the original three line endings |
| Longer edit | Replacing that paragraph with three copies grows the text height from 63 to 189 px; subsequent text and panels move/grow without overlap; source string restored afterward |
| Root resize | Changing desktop width from 1120 to 900 px resizes nested panels, input, button and text; root grows to 517.57 px height as wrapping increases, instead of clipping the former fixed-width controls; width restored to 1120 px |
| Narrow capture | Native hierarchy, text, images and gradient visibly match the stacked source layout; purple/bold nested phrase remains styled |

Figma test transfers used the production capture/encoder through the local lab and the browser automation clipboard. This proves host acceptance for these fixtures; it does not exercise an installed Chrome extension's messaging, permissions, storage or network broker. That installed-browser path and arbitrary real-site captures remain separate acceptance work.

Evidence: `quality-1.7.0/figma-desktop.jpg`, `figma-narrow.jpg`, `figma-long-paragraph.jpg`, `figma-paragraph-restored.jpg`, `figma-resize-900.jpg`, `figma-both-widths.jpg`, plus source-transfer JSON and browser reports. Screenshots show the actual Figma canvas. Text was restored after editing tests; root width was restored after resizing.

## Use and limits

Reload the unpacked extension from `apps/chrome-extension/dist`, refresh the source webpage, and take a **new capture**. Already-pasted layers and saved captures lacking these fields do not acquire the fixes automatically.

Original-font substitution can still affect wrapping. Hug frames retain their captured minimum height, so deleting text may leave space until that minimum is adjusted. CSS constraints that cannot be represented safely, overlapping/irregular content and absent Typed OM hints keep measured sizing. The optional JSON importer shares paragraph fixes but does not yet share the native clipboard's new frame sizing policy. A new browser breakpoint needs a fresh capture; resizing a Figma snapshot does not run the website's media queries.

### Embedded-preview failure follow-up (2026-10-21)

A user screenshot showed a dominant iframe placeholder labelled “Ready to copy” after export failed. The popup now marks that capture incomplete, disables native copying, opens diagnostic details, and retains the capture for diagnosis. Both restored captures and automatic capture/copy paths are covered. Frame composition reports node/depth limits, unmatched frames and preparation errors; frame handshake failures no longer assert that missing permission is the proven cause.

Validation: 187 tests passed, forced TypeScript check and both builds passed. The installed Magic Patterns failure has not been reproduced or resolved conclusively: the exact warning and installed extension version are needed. Do not treat these UI/diagnostic fixes as proof that embedded-site access works.

The user supplied the underlying warning: “Frame returned invalid content.” This means a child frame returned an OK response but failed scene validation; the earlier permission recommendation was not supported. Frame composition now includes up to three bounded validation field-path errors in diagnostics and still rejects malformed child content. The native encoder's generic placeholder error directs users to those diagnostics. Regression coverage checks that an invalid child dimension is reported and never composed. Validation: 188 tests, forced typecheck, both builds pass. A fresh installed capture is required because previous builds discarded validation details; the offending website field remains unknown.

### Invalidated content-script context

The user supplied the extension error view and bundled source showing `REGISTER_CAPTURE_FRAME` using `sendMessage(...).catch(...)`. A synchronous Chrome API exception escapes that expression. The iframe identity listener now catches both synchronous exceptions and rejected Promises, and detaches itself after an extension-context invalidation. Progress and cancellation notifications also tolerate synchronous exceptions. Tests verify both exception modes, listener retirement, transient retry and parent/token restrictions. All 194 tests pass; forced typecheck and both builds pass.

This prevents the error in newly loaded scripts; it cannot replace scripts already orphaned by an extension reload. Reload the extension first, then reload the webpage and its embedded frames. The separate captured-scene validation failure still requires fresh field-path diagnostics before a website-specific correction can be established.

### Embedded capture rejected for corner radii (2026-10-21)

Fresh diagnostics identify `cornerRadius.topLeft/topRight/bottomRight` exceeding the finite 0–1,000,000 contract. The capture parser previously forwarded unbounded pixel radii; malformed percentage expressions could also emit NaN. It now produces finite non-negative radii, recognizes the common fully-rounded infinity expression, and proportionally reduces circular corner radii to the measured box using the CSS adjacent-corner overlap rule (https://www.w3.org/TR/css-backgrounds-3/#corner-overlap). Ordinary radii remain unchanged. Existing percentage/elliptical-to-circular approximation is unchanged; arbitrary CSS math expressions are not evaluated by this parser.

Regressions cover huge Chromium-style pixel values, infinity expressions, asymmetric scaling, ordinary corners, invalid expressions and successful embedded-scene validation/composition. All 205 tests pass; forced typecheck and both builds pass. This corrects the demonstrated class of validation failure; the exact Magic Patterns page still requires a fresh capture to confirm no additional rejected fields. Attached bundle snippets already contain the invalidation handler fix; error history alone does not distinguish retained entries from new failures.
