# Web-font matching and text fidelity — 1.7.4

Native export previously replaced all captured font families and styled ranges with bundled Inter. It now captures accessible font-face data used by the scene, shapes with those actual files, and writes the corresponding family and variable-weight metadata. CSS aliases are resolved to the font's actual family. Mixed-style lines are segmented at style boundaries, so glyphs use the appropriate font/weight/size rather than only the first style on a line. Regular italic metadata is normalized to Figma's Italic style name.

## Capture and fallback

- Discovers font faces in readable stylesheets and document-adopted stylesheets. For inaccessible CSSOM rules, tries bounded ordinary CORS requests to the referenced stylesheet and resolves relative font URLs against that stylesheet.
- Fetches only faces matching captured families, weights/styles and Unicode subsets. It does not enumerate or read local/system fonts.
- Supports recognizable WOFF, WOFF2, TTF and OTF files. Captured fonts survive scene validation and embedded-preview composition, within the shared resource budget.
- Applies wght variations, including intermediate weights such as 650. CSS oblique text is treated as italic. Arbitrary custom variation axes, optical sizing, advanced OpenType features and synthetic styles are not fully mapped.
- Font readiness waits at most 1.5 seconds and reports when fonts are still loading. Font discovery/download has a five-second stage budget, two-second per-request timeout, at most 12 stylesheets, 128 KiB per fetched stylesheet, 12 retained faces, 256 KiB per font file and 1 MiB total font data. Failure/timeouts preserve the page capture and produce fallback warnings.
- If a matching face is unavailable, unsupported or lacks coverage for the text, export explicitly substitutes bundled Inter and warns that editing may change wrapping. Split Unicode font subsets that cannot individually cover the paragraph may still fall back.
- Font files are retained in the temporary saved capture and cleared through the existing successful-copy lifecycle. Native clipboard output contains glyph geometry, names and supported variations; it does not install font files in Figma. The recipient needs those fonts available to edit without substitution.
- No new permissions, production dependencies or bundled production font families. The added Lora/Roboto Mono files are local test fixtures, with their upstream licenses.

## Verification

234 tests pass, forced typecheck, both builds and quality-lab compilation pass. Cases cover font aliases, real glyph differences, variable weights, italic metadata, mixed-family ranges, missing/corrupt assets, unsupported glyph coverage, schema budgets, referenced resources only, unused weight/subset filtering, cancellation/timeouts and font transfer across embedded previews.

The real browser fixture passed all font checks with three actual variable font files: Lora normal, Lora italic and Roboto Mono. A second local origin supplied the stylesheet and font files; the CORS stylesheet-recovery and relative-URL paths also passed. The intentionally unavailable family produced an explicit Inter warning. Reports: [same origin](fonts-1.7.4/browser-fonts.json), [cross origin](fonts-1.7.4/browser-cross-origin.json).

Five existing core scenarios passed at each of 1440 × 1000 and 768 × 1000 CSS px. Desktop comparison against 1.7.3 showed no layer-count changes, lost structural checks or timing/payload budget violations. Large-card export median 189 ms versus 187 ms previously; long-paragraph median 65 ms versus 67 ms. These core fixtures use Inter and do not measure font network latency. Reports retain the pre-packaging version number; they include the candidate uncommitted source changes.

## Actual Figma web acceptance

On the user-authorized [FrameForge fonts · 1.7.4 QA page](https://www.figma.com/design/1BmxvKJEd0yNs1BJu6Qk7S/Oyonx-Socials?node-id=227-238):

- Native clipboard paste produced ten layers, four editable text layers and six Auto Layout frames.
- The inspector showed Lora / Bold for the heading. Editing it succeeded; its original wording was restored afterward.
- The paragraph remained one editable layer, visually retaining Lora bold/italic spans and the Roboto Mono inline code, with matching observed source line endings.
- The variable layer's inspector showed Roboto Mono and font style/weight 650.
- Figma's transient missing-font indicator cleared after loading. No manual font substitution was performed.

Source: [source.jpg](fonts-1.7.4/source.jpg). Figma evidence: [overview](fonts-1.7.4/figma-overview.jpg), [Lora Bold inspector](fonts-1.7.4/figma-lora-bold.jpg), [heading edited](fonts-1.7.4/figma-heading-edited.jpg), [Roboto Mono 650 inspector](fonts-1.7.4/figma-roboto-mono-650.jpg).

This host check used the production native encoder and a browser clipboard bridge, not the installed extension's messaging/storage path. Existing design pages were untouched; the new font QA page was added separately. The optional legacy JSON importer does not consume captured font binaries; it continues to use Figma's available fonts.

## Reproduce

Run `npm run quality:serve` and open `/font-lab`. For the cross-origin fixture, run `node scripts/serve-quality-lab.mjs --font-cross-origin` and open `/font-lab-cross`. The second fixture uses a second localhost port with CORS enabled. Font fixture provenance and licenses are in [fixtures/fonts](../fixtures/fonts/README.md).

Reload the extension and source webpage, then make a fresh capture. Older saved captures do not contain the new font assets.
