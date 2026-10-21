# Figma web acceptance — 2026-10-21

Production exporter: 1.6.0, unchanged from `43b4a73068d6f8c30040baeb99433b01c5f31220`. The user supplied a Figma web design file and signed in. Testing used a newly created **FrameForge QA · 2026-10-21** page. Two test frames remain there, side by side. Existing design pages were not edited.

## Scope and transfer path

This is an actual Figma web canvas check, not just decoding the clipboard. The local quality lab called production DOM capture, image normalization and native encoding. Its generated `text/html` and companion `text/plain` were staged in the browser automation session's clipboard and pasted using the Figma UI. Figma accepted native frames, text, vector and image paints. This staging was necessary because the page clipboard and automation's virtual paste clipboard are separate.

The installed Chrome extension was **not** exercised. Brave computer-use access was unavailable; popup messaging, storage cleanup, permissions, service-worker wake-up, real CDN assets and iframe broker behavior remain unverified in this session. Figma web's exact build number was not exposed by the inspected UI. These results are specific to the local fixture and observed host session.

## Findings

| Check | Result | Evidence |
| --- | --- | --- |
| Native host acceptance | Passed | Both HTML payloads paste into native frame hierarchies. Root frames are 1120 × 503 px for the 1440 px source viewport, and 720 × 764.57 px for the 768 px source viewport, matching their respective selected-element measurements. |
| Text editability and paragraph consolidation | Passed | The ordinary paragraph is one native Text layer: Inter Regular, 14 px, 21 px line height. Replaced its contents with a QA sentence and observed the actual canvas change, then restored the source text. |
| Initial paragraph appearance | Visually checked | Initial line positions look consistent with the source at both widths. This is a screenshot review, not a pixel-diff pass for every glyph. |
| Paragraph appearance after editing | **Failed** | Entering text editing causes different wrapping: the desktop paragraph's first line ends at “its” rather than “natural”. Restoring the original string retains recalculated wrapping. Source paragraph element width is 440 px; the native text layer reports 432.65 px. Tight text bounds are a plausible contributor; font shaping/reflow also needs investigation. |
| One-level rich text and explicit break | Visually checked | The bold phrase and explicit newline remain in the initial pasted output. Editing individual rich-text ranges was not tested. |
| Deeply nested rich text | **Failed** | “nested purple bold” appears in regular dark text rather than bold purple. This reproduces the capture-range-loss observation in the browser baseline on the real canvas. |
| Sampled nested Auto Layout | Passed | `div#acceptance-row`: Horizontal, 12 px gap; `div#acceptance-stack`: Vertical, 6 px gap. Confirmed in Figma's properties, not inferred from appearance. This is not a claim that every website wrapper is handled correctly. |
| Parent resize behavior | **Failed** | Reducing desktop root width from 1120 to 900 px clips parts of the right panel instead of reflowing all nested content. Restored root width to 1120 px. Some descendants retain fixed dimensions; Auto Layout presence alone does not ensure useful resizing. |
| Raster images | Passed for fixture | Both PNG and normalized WebP are visibly coloured at both widths. Inspected the PNG layer: native Image fill, 160 × 100 px source, 120 × 82 px target, Fill scaling, 8 px corner radius. This does not prove CDN/session image recovery. |
| CSS gradient | Passed for fixture stops | Figma paint editor shows editable Linear gradient: E69B39 at 0%, D94F74 at 45%, 566FCE at 100%, all 100% opacity. No exhaustive pixel comparison of interpolation/geometry. |
| SVG logo | Visually checked | Coloured gradient and square cutout visible; separate path and gradient-logo vector layers present in the layer tree. Complex SVG masks/clips were not tested. |
| Installed extension lifecycle / reference websites | Not run | Requires access to the installed browser extension and the original sites. Do not treat the lab transfer as passing those checks. |

## Saved evidence

All files are in `docs/quality-baseline/`:

- `figma-desktop-overview.jpg`: untouched initial desktop paste, before text/resize experiments.
- `figma-narrow-overview.jpg`: untouched narrow paste after moving it beside the desktop frame.
- `figma-horizontal-layout.jpg`, `figma-vertical-layout.jpg`: Figma properties for the sampled nested frames.
- `figma-paragraph-edit.jpg`: actual replacement text rendered in one Text layer.
- `figma-paragraph-after-edit.jpg`: restored original string with changed line wrapping.
- `figma-resize-900.jpg`: clipping at the temporarily narrowed root.
- `figma-gradient-stops.jpg`: Figma's native gradient stop editor.
- `figma-both-widths.jpg`: final QA page comparison. Desktop paragraph has been edited/restored; use the initial overview for the untouched baseline.
- `figma-source-1440.jpg`, `figma-source-768.jpg`: source HTML, not Figma output.
- `figma-transfer-desktop.json`, `figma-transfer-narrow.json`: source bounds/styles, encoder stats and warnings. The form/generated-text approximate-line-position warning was retained.

Source screenshots contain the lab's control panel above the selected fixture; it is not part of the pasted design. Each fixture has 38 encoded layers, 11 Text layers and 21 Auto Layout frames according to the encoder report. Sampled host properties confirm native interpretation, but the complete layer count was not independently recounted in Figma.

## Recommended next changes, awaiting approval

1. Preserve existing inner rich-text runs when consolidating outer paragraphs; turn the observed nested-style failure into a regression check.
2. Preserve paragraph container width and investigate native reflow after editing, with before/after Figma checks for line endings, clipping and text growth.
3. Separately introduce carefully bounded sizing improvements for eligible nested frames. Test Hug/Fill and longer labels against both width baselines; retain measured placement for irregular layouts.

No production fix was made as part of this acceptance pass. The failing cases are retained as evidence so subsequent changes can be judged against a real host baseline.
