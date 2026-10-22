# Current limitations

FrameForge converts supported DOM geometry and CSS into editable Figma nodes. Arbitrary websites are not guaranteed to reproduce perfectly.

## Browser capture

- Internal browser pages and extension-store pages cannot be captured. File URLs need the browser's explicit extension file-access setting.
- Full page means currently loaded DOM content. Lazy or virtualized sections must be loaded first. It does not crawl other responsive/device states.
- Full-page traversal defaults to 12,000 nodes; other modes default to 2,500. Validation caps complete scenes at 20,000 nodes. Depth remains 64. Node-truncated captures cannot be copied as complete pages. Full-page capture has a 60-second deadline; other modes have 30 seconds, with cancellation throughout. The 8 MB transport limit still applies.
- Viewport output clips to the visible browser frame; the traversal may retain offscreen descendants in the editable hierarchy.
- Shadow-root children are captured, but distributed slot behavior is not fully reproduced. Embedded frames are captured when Chrome permits extension access, with up to four nested frame captures and a shared node budget. Inaccessible frames remain placeholders; reload existing tabs after updating the extension.
- Canvas snapshots and video posters are imported when accessible. Tainted canvases and inaccessible media remain placeholders.

## Visual fidelity

- Available fonts may differ from browser web fonts. Native paste embeds shaped glyph outlines on editable TEXT nodes using bundled Inter faces. Other captured font families are substituted with Inter and reported. Original web-font files are not collected. Wrapping, ligatures and mixed-style inline text can still differ.
- Eligible text-only inline markup consolidates into one editable paragraph with style ranges, measured soft wraps and explicit BR newlines. Painted/positioned inline elements and block-structured text retain their hierarchy. Source subpixel bounds are preserved; display:contents wrappers use virtual bounds. Original font substitution and text editing can still change wrapping.
- Version 1.7.0 retains deeply nested style ranges and uses the actual block content width with native text auto-height. This fixes the tested Inter paragraph's reflow after editing; fallback-font metrics and unusual inline layouts can still differ. Native export uses CSS sizing intent and measured geometry to enable eligible Fill/Hug behavior, including pixel min/max constraints. Browsers without Typed OM sizing values fall back to measured placement. Explicit fixed dimensions, irregular/overlapping flows and unsupported CSS constraints remain conservative. Hug frame heights keep the captured size as a minimum, allowing growth while avoiding initial shrinkage; reducing content may leave space until that minimum is adjusted. CSS responsive breakpoints are not recreated in Figma; capture each desired browser width separately. The optional JSON importer shares the text fixes, but does not yet implement the native clipboard's new frame sizing policy.
- Fresh captures retain measured line fragments, including inline continuation offsets, and initial native rendering fits fallback glyph widths to those fragments. Captures made before 1.2.1 lack this metadata and need recapturing for accurate inline wrapping. Text uses measured boxes. Simple Auto Layout is retained when measured geometry agrees; aligned non-overlapping block flows also derive Auto Layout, using spacers for unequal gaps. Regular wrapped rows and aligned grid-like rows can become nested Auto Layout frames. Absolute/fixed decorations and background-image layers stay absolute without blocking the surrounding flow. Mixed inline wrapping, overlapping and irregular layouts preserve measured positions; empty/decorative wrappers do not need Auto Layout. Differing child insets can use editable row/column wrappers; CSS-reordered stacks use measured visual order. Recapture with 1.4.0 for the latest layout and gradient metadata.
- Simple backdrop-filter:blur(px) is retained as native background blur; combined backdrop filters remain limited. Translucent uniform borders share one paint. Different border colours per edge currently use the first shared colour and produce a warning.
- CSS transforms, complex stacking, blend modes, masks, advanced filters/gradients and complex generated content are not fully reproduced. Some conditions produce warnings; not every unsupported feature is detected.
- Text-bearing ::before content uses approximate geometry. Decorative pseudo-elements and ::after are not fully reconstructed.
- Borders/radii/images are editable, but dashed borders, elliptical corners, complex per-edge rounded corners, background positioning/repetition and object-fit:none can differ.
- Linear and common radial gradients preserve geometry, layered fills, alpha and supported stop positions. Oklab/Lab/linear-sRGB interpolation uses bounded intermediate stops. Wide-gamut colours are clipped to sRGB; conic/repeating gradients, interpolation hints, some radial positioning and resized backgrounds remain limited. Mixed image/gradient stacking and blend modes require adjustment.
- CSS background images are currently approximated as covering the element. Native SVG conversion supports basic paths, circles/ellipses, rectangles, lines and polygons with transforms. Native SVG linear/radial paints support local definitions, transforms and inherited stops. Repeating spread, focal radial geometry, masks/clipping, external sprites and unsupported elements remain limited and can produce warnings.

## Images and resources

- Page image requests use same-origin session credentials. Cross-origin requests omit credentials and can retry through an extension background broker under existing host permissions. Protected/hotlink-restricted images, unavailable blobs, unreadable loaded images and decode failures can still produce warnings/placeholders.
- Browser-only raster formats are converted to still PNG with a 2048px maximum side and the per-image byte limit. Animation is not retained; PNG/JPEG inputs keep their original bytes.
- Downloads have four concurrent workers, URL caching, a 10-second per-request timeout and a 2 MB per-image limit. Embedded data is also bounded by per-capture and serialized-storage budgets.
- Native export rejects captures above 200,000 text characters before shaping. Shaping within the limit is synchronous and cannot be cancelled mid-operation.
- Figma may reject image encodings it does not support. SVG image data is imported as vectors when parseable.

## Delivery and verification

- Copy to Figma writes native binary clipboard HTML and requires no Figma plugin. The private clipboard format has no stability guarantee; an upstream encoder upgrade may be needed when Figma changes it. JSON remains available for the optional legacy importer. SVG copy is a separate limited fallback.
- Chrome/Chromium packaging is provided; Firefox is not packaged or verified. No account, billing or device-emulation service is implemented.
- Automated tests use DOM/Figma/Chrome mocks for host APIs. Real browser DOM capture has been smoke-tested locally, but actual installed-extension and Figma canvas acceptance remain required. Native clipboard structure is tested by decoding; actual Figma rendering and installed-extension cross-origin acceptance remain unverified. See [verification](FIXES_AND_VERIFICATION.md).

Web-font matching (1.7.4): accessible CSS font faces can retain original glyphs and metadata within bounded capture budgets. Local-only fonts, CORS-protected resources, unsupported files, insufficient glyph coverage and unsupported subset combinations use explicit fallback warnings. Clipboard paste does not install fonts in Figma. Custom variation axes/optical sizing and advanced OpenType/synthetic styles are not fully mapped; the legacy importer does not read captured font binaries. See FONTS_1.7.4.md.
