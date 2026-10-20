# Browser extension audit — 1.4.0

20 October 2026. Follow-up to the reported Outlook copy failure and inconsistent Auto Layout/gradients.

## Service worker inactivity

Chrome normally terminates an idle extension service worker after about 30 seconds and wakes it for extension events. Inactive does not mean disabled. FrameForge registers message, command and menu listeners synchronously and persists captures in Chrome storage. An artificial keep-alive was not added. The reported image enum error is independent of this lifecycle.

Reference: [Chrome service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Findings and changes

| Priority | Finding | Implemented fix |
| --- | --- | --- |
| P1 | Scene dependency accepts CROP, but native binary schema accepts STRETCH/FIT/FILL/TILE. Ordinary object-fit:fill images could abort copying. | Normalize at the serialization boundary; test all three supported fitting modes through the actual encoder/decoder. Outlook itself was not accessed. |
| P1 | Diagonal gradient rotation ignored rectangular CSS gradient-line length. | Dimension-aware affine transforms, angle units and aspect-dependent corner directions. |
| P1 | Parser consumed only one gradient, misplaced omitted stops and missed double/px stops. | Balanced layer splitting, CSS stop fix-up, double stops, pixel positions, extended linear axes and preserved paint order. |
| P1 | Transparent black and modern interpolation changed colour transitions. | Premultiplied-alpha sampling and bounded intermediate stops; adjacent hue at zero-alpha endpoints; modern-colour Oklab default and explicit sRGB, linear sRGB, Oklab and Lab interpolation. |
| P2 | Radial gradients were omitted. | Common circle/ellipse geometry, centres, radii and side/corner sizing preserved in native data and optional importer. |
| P2 | Modern CSS colours could become black; gradient colours were missing from the palette. | Direct use of the existing Culori dependency for modern functions and named colours, conversion to bounded sRGB; visible stop colours included in analysis. |
| P2 | Differing insets and CSS-reordered children could lose Auto Layout. | Transparent editable row/column wrappers preserve differing insets; stack order follows measured visual order. Overlaps remain measured. |
| P2 | SVG fallback ignored stored gradient geometry and applied stop alpha twice. | Affine/radial definitions and RGB-only hex with one opacity value. SVG remains a limited alternate export, including single-primary-fill rendering. |
| P2 | Unsupported gradient details could disappear silently. | Warnings for unsupported gradient forms, resized backgrounds, blending, gradient-clipped text and mixed URL/gradient stacking. |

## Verification

- 141 tests across 19 files passed, including image modes, geometry, stop fix-up, radial encoding, alpha/interpolation, modern colours, palette extraction and measured flow.
- Forced TypeScript checking and both application builds passed. Native browser-targeted VM probe passed with eval/Function/Wasm disabled.
- Eight actual Chromium DOM captures were encoded/decoded: diagonal/corner linear gradients, omitted/double stops, external pixel stops, off-centre ellipses, farthest-corner circles, layered alpha and modern colours. CSS source was visually compared with SVG previews built from decoded native paints. The pairs looked closely matched after the interpolation fix; no numerical pixel-perfect claim is made.
- [Browser comparison screenshot](gradient-browser-1.4.png). Run `node scripts/preview-gradients.mjs` to repeat. It uses no user pages and writes no clipboard data.
- Installed-extension Outlook capture and actual Figma canvas acceptance remain unverified. The demonstrated schema failure now has a real encoder/decoder regression; this does not prove all Outlook visual details.

## Remaining limits and next improvements

“Any website perfectly” is not a supported guarantee. Browser-restricted pages, inaccessible frames/media, unloaded/virtualized DOM and capture budgets remain boundaries. Complex transforms, masks, distributed/closed shadow content, gradient text clipping, blend modes and mixed image/gradient stacking still need work.

Native colours are sRGB. Wide-gamut colours are clipped. Modern interpolation is approximated with up to 16 subdivisions per source interval within a 100-stop budget. Conic/repeating gradients, interpolation hints, unsupported hue modes, some radial positions/radii and explicit background sizing remain limited and produce warnings when detected. Sampled colours also appear in the palette. This is editable approximation rather than an original wide-gamut colour-space round trip. CSS interpolation follows [CSS Images](https://www.w3.org/TR/css-images-3/#color-stop-syntax) and [CSS Color](https://www.w3.org/TR/css-color-4/#interpolation).

Auto Layout covers validated rows/columns, regular grid-like rows, differing insets and positioned decorations. Masonry, overlapping arrangements and mixed inline text are not forced into arbitrary stacks. Wrappers add hierarchy where needed; responsive CSS behaviour and semantic intent are not fully reconstructed.

The colour implementation increases the passive content bundle to about 187 KB from 75 KB in 1.3.0. The multi-megabyte native encoder still loads on demand. No new browser permission, remote service or account requirement was added.

## Reload and acceptance

Reload the unpacked extension, verify v1.4.0, refresh the webpage and capture again. Existing saved Outlook captures can benefit from the image-mode fix without recapturing; new gradient/layout metadata requires a fresh capture. In Figma, compare at matching viewport dimensions and inspect nested padding and text edits. Site-specific differences need source/canvas comparisons before being called resolved.
