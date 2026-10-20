# Capture quality audit — 1.5.0

20 October 2026. Reviewed image acquisition and encoding, DOM text capture, measured layout, protocol validation, native export, optional importer and analysis. This follows the reported missing images, fragmented paragraphs and nested Auto Layout gaps.

## Findings addressed

| Priority | Finding | Change |
| --- | --- | --- |
| P1 | Content-script image fetches are subject to page CORS even with extension host permissions. | A private background image broker uses the existing host permissions. Bounded page fetch is followed by a bounded broker retry. See [Chrome network request guidance](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). |
| P1 | Same-origin images requiring the page session were fetched without credentials. | Page fetch uses same-origin credentials. Cross-origin and extension fetches omit credentials; no cookies, headers or tokens are forwarded to the broker. |
| P1 | Image encoding used FileReader, unavailable in service workers. | Streamed bytes are encoded without FileReader. Per-image streaming limits, timeouts and MIME checks remain. |
| P1 | Browser raster formats could be embedded without ensuring portable output. | WebP/AVIF/GIF and other decodable raster formats are converted to PNG, preserving alpha, with a 2048px maximum side and the existing byte budget. Existing PNG/JPEG/SVG data is retained. Animation is a still image. |
| P2 | Expiring URLs or failed retries could lose an already-loaded image; some CDNs use octet-stream MIME. | Bounded canvas fallback for readable loaded images, and signature recognition for common binary raster responses. Tainted canvases and HTML login pages are not accepted as recovered images. |
| P1 | Inline spans/strong/em markup created separate text layers. | Eligible text-only inline content consolidates into one paragraph TEXT node. It retains the complete string, inline style ranges, measured fragments and explicit BR newlines. Font weight, size, colour and decoration ranges are encoded natively and supported by the optional importer. |
| P2 | Multiple fragments on a browser line became separate baseline records. | Paragraph shaping merges compatible line records and retains line-relative character offsets. This preserves soft wrapping without inserting artificial newlines into the editable string. |
| P1 | display:contents wrappers had zero dimensions, blocking surrounding layout inference. | Such wrappers receive virtual descendant bounds and rebased coordinates. Their non-rendering box paints are removed. |
| P2 | Regular wrapped rows were rejected when DOM order, vertical alignment or the last row's width differed. | Group by measured row geometry, sort within rows and use full-width row frames with measured padding. Inset wrappers and positioned decorations remain supported. |
| P1 | Rounding each nested relative coordinate accumulated errors. | Capture retains subpixel positions and sizes through the hierarchy. Native geometry checks receive the original fractional measurements. |
| P2 | Consolidation could leave inaccurate counts or omit rich-text colours and weights in analysis. | Count final captured output nodes and analyze paragraph style ranges individually. |

## Boundaries retained

The broker accepts private requests from a tab/frame, restricts URLs to HTTP(S) without embedded credentials, limits outstanding downloads to eight and supports owner-scoped cancellation. It retains the 2MB per-image bound and an eight-second broker timeout. Page requests have a 3.5-second limit before retry. Captures retain their overall deadline and transport/storage budgets. No new manifest permission or remote service was added.

Text consolidation rejects painted/clipped inline wrappers, positioned content, incompatible opacity/case transforms, mixed block layouts and incomplete measured fragments. It does not flatten icons, highlighted backgrounds or other visible inline structures to force a paragraph. The optional SVG fallback does not yet reproduce every rich-text range.

## Verification

- 159 tests across 22 files passed. Coverage includes actual native paragraph encoding/decoding, inline style tables, baselines, broker recovery, sender/URL rejection, cancellation ownership, WebP conversion/resource cleanup, FileReader-free encoding, octet-stream image recognition, fractional bounds, virtual wrappers and irregular final rows.
- Forced TypeScript checking, both application builds and the native browser VM probe passed.
- A real Chromium fixture produced one editable paragraph TEXT layer with bold style ranges, an explicit newline and four measured lines. It produced 14 Auto Layout frames and two native raster paints with embedded PNG blobs. Decoded image blobs were rendered back in the browser.
- The fixture exercised a real two-origin CORS failure and a successful local broker recovery, plus actual WebP-to-PNG conversion. Chrome messaging was simulated by the local server; this is not installed-extension host-permission acceptance. No clipboard write or Figma action was performed.
- [Browser evidence](capture-quality-1.5.png). Repeat with `node scripts/preview-capture-quality.mjs` after type checking/building. It serves only local synthetic test content.
- Actual affected production sites and Figma rendering remain to be checked. No URL or new source/output comparison accompanied this request; source-specific correctness cannot be established from the code audit alone.

## Remaining improvements, in priority order

1. **Production visual acceptance:** compare source and Figma at matching dimensions. Inspect text editing, nested row padding and real protected image behavior. Private clipboard compatibility is not proved by decoder tests alone.
2. **Original fonts and responsive sizing:** current fallback fonts and fixed measured boxes preserve initial geometry but do not recreate every CSS font or responsive/hug/fill rule. Rich text edits can reflow differently in Figma.
3. **Protected and lazy media:** cross-origin authenticated/hotlink-protected images, unavailable blob data, tainted canvases, decoding failures and unloaded/virtualized media can still produce explicit warnings/placeholders. Loading a page's visible image does not grant unrestricted pixel access. Resource budgets may also exclude large images.
4. **Complex layouts:** masonry, intentional overlaps, transformed content, multi-column text, vertical writing and paragraphs built from separate block elements remain measured or separate. Empty/decorative wrappers do not inherently need Auto Layout.
5. **Capture preparation:** bounded waits for fonts/images and an explicit lazy-loading capture mode could improve pages whose layout changes during capture. Automatic scrolling is not implemented.
6. **Typography analysis/alternate exports:** rich runs are retained in the primary native output and importer; improve range-aware SVG export and broader writing-system font support next.
7. **Performance:** synchronous text shaping and bitmap decoding can still delay large exports. Worker/chunked processing and a per-capture asset table could reduce repeated data and improve cancellation responsiveness.
8. **Advanced CSS:** masks, filters, blend modes, gradient-clipped text, unsupported gradient forms, repeated backgrounds, full background positioning and closed/distributed shadow content remain fidelity limits.

## Reload

Reload the unpacked extension and verify v1.5.0. Refresh the source webpage, load any lazy sections, then capture again. Saved captures cannot gain missing image bytes, inline style ranges or subpixel geometry automatically. Paste directly on the Figma canvas; successful copies continue to clear their saved capture.
