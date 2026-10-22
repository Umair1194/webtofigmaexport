# Full-page capture — 1.7.6

## Failure and changes

A long component page could stop at an arbitrary section because traversal defaulted to 2,500 source nodes. A second limit rejected scenes above 5,000 output nodes. Independently, embedded-frame routing always requested VIEWPORT, and composed the result inside the iframe's original viewport-height clipping frame.

- Full-page traversal now defaults to 12,000 nodes, with a shared bounded 20,000-node validation ceiling. Other capture modes retain their 2,500-node defaults. Explicit budgets are sanitized and bounded, including child-frame requests.
- A single dominant preview inside a viewport-sized shell receives FULL_PAGE mode. The outer document adopts the preview's complete root, dimensions, viewport and diagnostics, while retaining the parent capture's title and URL. Ordinary iframe widgets remain clipped to their visible viewport.
- Full-page traversal expands the main app scroll pane using its loaded scrollHeight, compensates its current scrollTop and propagates the new height through containing frames. It does not scroll or alter the live page. Sidebar rails and small scrollable widgets retain their viewport geometry.
- Full-page capture receives a 60-second deadline, with a 45-second child-frame broker deadline and existing cancellation. Other modes retain their previous deadlines.
- Newly truncated captures are not saved or automatically copied. Older node-truncated saved captures show Capture incomplete and are blocked by both popup and native encoder.

## Verification

247 tests pass across 33 files, including long loaded DOM content beyond the old cutoff, validation above 5,000 nodes and rejection above the new ceiling, full-page broker routing, dominant preview promotion, unchanged ordinary iframe clipping, main-pane expansion versus viewport mode, and incomplete-capture guards.

Forced typecheck, both production builds, quality-lab bundle compilation and diff whitespace checks pass.

The browser fixture at `/long-page-lab` exercises production capture, real frame composition, validation and native encoding/decoding with a viewport-height iframe containing a separate internal scroll pane. Its 3,000 loaded rows include Product promotion followed by additional content and a final section. It exported a complete **72,276px** page with **6,015 layers, 3,005 editable text layers and 3,010 Auto Layout frames**, in approximately 3.24 seconds in this run. All end-of-page checks passed. The fixture mocks Chrome transport locally; actual broker ownership and mode routing are unit-tested.

The complete 4 MB native HTML payload was pasted into the user-authorized Figma test file on the isolated page **FrameForge long page · 1.7.6**. Figma's search found **Final page section** at the bottom, alongside Reference row 2999, and its inspector confirmed native editable text and Auto height. Existing design pages were not edited.

Evidence: [browser report](long-page-1.7.6/browser-report.json), [Figma final section](long-page-1.7.6/figma-final-section.jpg).

The user subsequently identified **Petopus domain** as the affected sidebar page. Inspected its live rendered source (about 21,219px tall at 1280px width) and verified a rendered snapshot with production capture, font collection, validation, native encoding and binary decoding. Reapplying the old 2,500-node budget reproduced truncation near Product promotion / the start of Virtual queue: 2,488 output nodes, ending at the queue-state labels. The updated default captured 4,283 scene nodes and produced 5,222 native layers, including 1,106 text layers and 2,767 Auto Layout frames. All 11 checked headings from Product promotion through Build from the base survived native decoding with no node-limit warning, including every subsequent main section. See [exact-page comparison report](long-page-1.7.6/petopus-domain-report.json).

This additional comparison verifies page completeness. The snapshot harness does not run the installed extension, and skips its image-inlining stage; missing-image and unsupported-style warnings in that report do not represent a full asset-fidelity acceptance check. The real Figma paste proof above uses the long-page regression fixture.

## Reload and limits

Reload the extension and source webpage, discard the old saved capture, choose Full page and capture again. Old captures cannot recover omitted content.

Full-page capture includes loaded DOM content. Infinite feeds, virtualized rows that are not in the DOM, and lazy content that has not been loaded remain outside this snapshot. Nested third-party widgets are not expanded indiscriminately. The existing 8 MB JSON transport, image/font budgets, depth and cancellation limits still apply; a page exceeding the limits requires section captures rather than a silently incomplete export.
