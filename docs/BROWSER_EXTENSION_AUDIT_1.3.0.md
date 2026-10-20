# Browser extension audit — 1.3.0

Reviewed on 20 October 2026. This records implemented changes and remaining acceptance work, rather than claiming universal visual fidelity.

## Scope

Reviewed the manifest, build and CI; background shortcuts/context menus, capture storage and embedded-frame routing; content-script capture, picker, inspector and progress; DOM geometry/text/layout capture, asset budgets and validation; native clipboard encoding, text shaping, SVG geometry and measured Auto Layout; popup state, recovery, secondary exports and accessibility. Existing legacy Figma importer coverage remains separate from the primary direct-paste workflow.

## Findings addressed

| Priority | Finding | Implemented result |
| --- | --- | --- |
| P1 | Saved captures persisted after successful native copying. Concurrent tabs could race with deletion. | Background serializes saves and conditional clearing by capture ID. Only the matching capture is removed after clipboard success. Newer captures survive. |
| P1 | Copy, cleanup and capture failures could produce misleading states. | Copy failure retains retry data. Cleanup failure explicitly says copying succeeded. Busy controls prevent duplicate exports. Errors restore usable controls; stale startup reads cannot resurrect cleared data. |
| P1 | Toolbar could say copied when in-page clipboard delivery failed. | Copied, saved for retry, inspector and selection results have distinct truthful messages; success resets the error badge color. |
| P1 | Positioned badges/background layers prevented useful nested Auto Layout; regular wrapped rows stayed absolute. | Capture retains positioning roles. Export excludes absolute decorations from flow checks and derives validated horizontal rows inside vertical Auto Layout parents. Overlap remains measured. |
| P2 | Native encoder made the passive page script about 2.2 MB. | A lightweight private broker injects the encoder into the requesting frame only when copying. Passive content bundle is now 75.3 KB. Requests validate source, document and size. |
| P2 | Capture IDs could collide across tabs; frame tokens depended on secure-context UUID availability. | Capture IDs use random components; frame tokens use crypto.getRandomValues, including on ordinary HTTP pages. |
| P2 | Popup navigation gave many tools equal weight and obscured the main job. | Single capture surface, three scope choices, one primary action and collapsed details. Source title/host, retry and discard remain visible where needed. |
| P2 | Layout counts reflected capture hints rather than encoded output. | Pre-copy summary says Auto Layout “On copy”; completion reports actual encoded layers and Auto Layout frames. |
| P2 | Generic visual treatment, stale version, weak state hierarchy. | Neutral palette, restrained green, consistent stroke icons, system typography, compact spacing, real manifest version and separate success/error states. |
| P2 | Large text shaping could lock the popup for pathological inputs. | Reject over 200,000 text characters before shaping. Existing node, image and JSON budgets remain. |

## Interaction and visual decisions

The 392 × 600 popup uses familiar native radio semantics for capture scope. Visible area is the default; Full page explicitly means loaded content. Current-page identity reduces accidental wrong-tab capture. Capture & copy communicates both actions. Keyboard paste guidance follows the action rather than asking users to operate a separate importer.

A saved capture is a recovery state. Copy to Figma is primary and Discard is subordinate. Analysis and alternate formats remain available behind Details & other formats before native copying. Successful copying clears the capture automatically. No-warning completion closes after a short confirmation; export notes keep a Done control available. Failed copying stays recoverable.

Focus indicators, disabled/busy states, keyboard tabs, live status and reduced-motion handling are implemented. This is not a screen-reader conformance certification. The revised flat application icons and page panels match the popup.

## Verification

- 127 automated tests across 18 files passed, including storage queue races, newer-capture preservation, stale reads, copy failure, cleanup failure, duplicate actions, cancellation, private injection, wrapped-row encoding and absolute decorations.
- Forced TypeScript checking and both application builds passed.
- Native browser-targeted VM probe passed with dynamic evaluation and Wasm disabled: 27 text glyphs, one Auto Layout frame and two stroked shapes in its fixture.
- Actual built popup reviewed in the in-app Chromium browser at 392 × 600. Its harness mocks Chrome APIs and clipboard writes, while running real native encoding. A successful copy changed saved state to empty; a denied clipboard write retained saved state and enabled retry.
- Actual installed Chrome extension and Figma canvas acceptance were not exercised here. Existing Figma computer-use access was denied in the earlier review. Binary validation and the browser harness do not prove Figma rendering or cross-origin host behavior.

Screenshots: [capture](extension-1.3-empty.png), [saved recovery](extension-1.3-ready.png), [success](extension-1.3-copied.png), [clipboard failure](extension-1.3-failure.png).

## Remaining improvements and limits

1. **Figma visual acceptance:** compare the actual source and pasted design at the same viewport, inspect nested rows and edit text. Native Figma clipboard encoding is a private format and can change upstream.
2. **Font fidelity:** bundled Inter substitutes other families. Captured text fragments improve initial rendering, but edits can change browser/Figma wrapping and metrics. Original web-font collection would require a separate resource and licensing design.
3. **Intentional positioning:** mixed inline wrapping, irregular/masonry layouts, overlapping shapes and empty/decorative wrappers are not forced into Auto Layout. Doing so without reliable flow geometry can move content. A layout count is not a percentage of correctness.
4. **Advanced CSS/media:** transforms, masks, blend/paint servers, some SVG and background properties, closed shadow content and inaccessible images/iframes remain fidelity limits. Full page captures only loaded DOM.
5. **Site access:** existing broad host access enables permitted embedded-frame capture. Optional per-site access could improve permission clarity, with additional capture-time prompts and frame-access tradeoffs. No new permission was introduced in 1.3.0.
6. **Long exports:** text shaping within the bound remains synchronous. Chunking or a dedicated worker could improve cancellation and responsiveness on large text-heavy captures.

## Reload steps

Reload the unpacked extension at chrome://extensions, verify v1.3.0, then refresh the source webpage and capture again. Old injected scripts and saved captures do not gain new positioning metadata automatically. Paste directly onto the Figma canvas.
