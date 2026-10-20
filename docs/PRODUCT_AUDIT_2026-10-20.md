# FrameForge product audit — 20 October 2026

> Historical pre-fix audit. See [subsequent fixes and verification](FIXES_AND_VERIFICATION.md) for current status.

## Verdict and scope

**FrameForge is a promising prototype, but it is not ready for production or functionally equivalent to Export to Figma.** The primary capture/import journey has blocking defects; the fidelity engine needs work before a visual refresh can deliver the intended experience.

Reviewed both applications, all five shared packages, manifests, build scripts, tests, fixture and project documentation. Ran the existing tests, forced TypeScript build checking, production bundles and targeted behavioral probes. Visually inspected the extension popup and plugin UI as local HTML previews, and the competitor’s public website and embedded product demonstration.

Evidence labels below:

- **Reproduced:** executed a targeted probe against current code.
- **Code-confirmed:** directly visible implementation defect or missing behavior; output consequences have not been measured in real Figma.
- **Risk:** plausible runtime or scaling problem requiring targeted integration testing.
- **Design assessment:** judgment from rendered previews and implementation, rather than measured user research.

Limitations: the local HTML previews do not exercise Chrome extension APIs or the Figma sandbox. No real Figma canvas import, installed competitor extension test, production website capture benchmark, screen-reader session or screenshot-difference fidelity run was completed. Competitor capabilities are its publicly advertised behavior, not independently verified performance. No source implementation was changed during this audit. Builds regenerate ignored outputs. Git inspection was unavailable because the system Git command requires acceptance of the Xcode license.

## Validation results

| Check | Result | Interpretation |
|---|---|---|
| `npm test` | 32 tests across 5 files pass | Utility-level coverage; no actual capture or importer integration coverage |
| `npm run typecheck` | Pass | Build-mode TypeScript command returned success |
| `npm run typecheck -- --force` | Pass | Forced recheck returned success |
| `npm run build` | Pass | Both bundles generated |
| `node scripts/audit-probes.mjs` | All 3 defect probes confirmed | Picker saves nothing; weight 400 becomes Light; black on white reports 1:1 contrast |
| Local interface previews | Inspected | Confirms baseline visual hierarchy, not host integration |

The probes assert current broken behavior; they are audit evidence, not regression tests specifying correct behavior. Replace or invert those assertions when implementing fixes.

## Competitor parity

Reference: [Export to Figma public product page](https://www.exporttofigma.com/), accessed 20 October 2026. The website advertises page/element capture, direct paste, editable layers, preserved typography/styles/images and responsive layout properties. Its demonstration emphasizes an in-page toolbar with Desktop, Select Element and Export. Device options beyond the shown Desktop control have not been independently verified.

| Capability | FrameForge today | Gap and acceptance requirement |
|---|---|---|
| Select an element and export | Picker exists but cannot complete | Click selected element → a new capture is persisted with correct dimensions |
| Full-page capture | DOM traversal exists | Correct document bounds; lazy content policy; explicit truncation warnings |
| Viewport capture | Mode label exists; no viewport clipping/filtering | Output frame exactly matches viewport and excludes out-of-view content visually |
| Direct editable paste | Plain JSON copied to clipboard | Native paste workflow is absent; establish a working, maintainable delivery mechanism before promising parity |
| Editable text | Native text creation exists | Preserve width/wrapping, regular weight, line breaks and styled inline text |
| Styles and effects | Partial conversion | Correct borders, radii, gradients, clipping, transforms and stacking; honest unsupported warnings |
| Embedded images | CORS fetch attempted | No silent missing assets; deduplicate, bound downloads, report failures |
| Responsive layouts | Basic flex inference | Preserve captured appearance, then valid editable layout; device controls need an explicit implementation |
| Fast in-page workflow | Popup, capture, copy, open plugin, import | Persistent completion feedback, fewer steps and recoverable errors |
| Browser support | Chrome-specific implementation | Firefox support advertised by competitor is absent; Chromium variants need testing |
| Accounts and plans | No account/billing system | Commercial packaging gap only if subscriptions are part of the intended product |
| Design inspection and docs | Palette/type/assets/contrast + Markdown exports | Useful differentiation, but contrast is currently wrong and secondary features crowd the main task |

Matching public functionality does not require duplicating the competitor’s brand or exact artwork. The product should retain its own identity while matching the ease and reliability of the capture workflow.

## Blocking and high-priority defects

### A01 — P1: Element picker discards the selection [Reproduced]

`apps/chrome-extension/src/content/content.ts:132–147`: click calls `stopElementPicker()`, which calls `removeOverlays()`, which sets `highlightedElement = null`. The following condition can never enter the capture branch. A selected-element export silently produces nothing.

Fix: save the target locally before cleanup; use the actual clicked element where appropriate; catch capture/storage errors and show completion in-page. Add a real picker interaction test including Escape and clicking without a preceding mousemove.

### A02 — P1: Viewport and full-page modes do not establish the requested output bounds [Code-confirmed]

`packages/dom-capture/src/capture.ts:380–425`: every mode traverses the same body subtree. Calculated `rootWidth`/`rootHeight` only apply when a fallback root is created; normal body-frame captures keep body bounds. No viewport intersection filtering or dedicated viewport clipping wrapper exists. Body margin, scroll position and a long document can therefore produce the wrong extent. Selecting an image/SVG would use viewport-sized wrapper bounds rather than the selected element’s bounds.

Fix: normalize output into a dedicated root at 0,0 with mode-specific dimensions and clipping; retain internal offsets. Test nonzero scroll, body margins, horizontal overflow and non-frame selections.

### A03 — P1: Text bounds are captured but not applied on import [Code-confirmed]

`apps/figma-plugin/src/code.ts:232–289`: text receives characters and typography but no resize or explicit auto-resize policy. Browser wrapping and measured width/height are lost; paragraphs can expand and displace layouts.

Fix: apply the captured text box and explicit sizing, verify line breaks and font metrics, and support inline runs or measured text fragments where needed. Compare long headings, mixed bold/link text, multiline paragraphs and narrow cards in real Figma.

### A04 — P1: Regular text becomes Light [Reproduced]

`apps/figma-plugin/src/code.ts:14–23`: weight 400 falls into `weight >= 300` and becomes Light. This affects ordinary body text throughout imports. Add an explicit Regular branch and parameterized weight/style tests.

### A05 — P1: Auto Layout changes geometry instead of preserving it [Code-confirmed]

`packages/dom-capture/src/layout.ts:15–67`, `apps/figma-plugin/src/code.ts:211–226`: all flex layouts are assigned 0.95 confidence; importer forces both axes to AUTO. Captured width/height can change. Inferred wrap is never applied. Reverse order, margins, flex grow/shrink, stretch, absolute children and generated background-image children are not reconciled. Background images can become ordinary flow items.

Fix: preserve fixed dimensions first; infer layout only when children and measured positions support it. Keep decorative and positioned elements out of flow. Add wrap/reverse/grow handling and fall back to absolute placement when uncertain.

### A06 — P1: Image import relies on a browser global inside the Figma sandbox [Risk]

`apps/figma-plugin/src/code.ts:102–111`: decoding uses global `atob`; the bundle supplies no decoder. Availability must be tested inside actual Figma, whose plugin main code is not a DOM browser context. Failure is caught and replaces the image with gray, potentially making every image appear broken.

Fix: use a supported Figma decoding API or bundled decoder and validate JPEG, PNG, WebP and SVG data URLs in the real sandbox. Handle URL-encoded data URLs explicitly rather than treating all image data as base64.

### A07 — P1: Accessibility contrast audit compares text against itself [Reproduced]

`packages/shared-protocol/src/inspector.ts:63–109`: all solid fills, including text fills, overwrite `currentBg`. The text branch compares foreground with that same color. Black text on white reports 1:1 instead of 21:1. Text colors are also counted twice in the palette.

Fix: update background state only for background-bearing nodes, then composite transparency. Mark gradients/images/overlays as uncertain where appropriate. Test known contrast pairs, inherited backgrounds and alpha. Avoid a general WCAG compliance claim from a contrast-only tool.

### A08 — P1: Captured strings become extension/plugin HTML [Code-confirmed]

`apps/chrome-extension/src/popup/popup.ts:90–142`, `apps/chrome-extension/src/content/content.ts:220`, `apps/figma-plugin/src/ui.html:205–207,271–295`: website text, names, font strings, imported titles and warnings are interpolated into `innerHTML`. Untrusted content can create markup in privileged UI. CSP may block some script execution; it does not make HTML injection safe.

Fix: create elements and assign `textContent` for captured/imported strings. Keep static layout markup separate. Verify literal rendering of angle brackets and hostile markup without making external requests.

### A09 — P1: Validator leaves nested payloads unchecked [Code-confirmed]

`packages/scene-graph/src/validator.ts:61–177`: fills, stops, effects, radii and Auto Layout largely pass through as arrays or `any`. Numeric types and enum values are insufficiently checked; malformed payloads can reach Figma setters and abort midway. Depth above 100 is silently dropped, with no warning, while breadth and string/asset sizes have no total budget.

Fix: validate every discriminated field; enforce finite ranges, total nodes, depth, asset bytes and text bytes; reject or explicitly warn on truncation. Return actionable field paths.

### A10 — P1: Failed or concurrent imports can leave a damaged workspace [Code-confirmed]

`apps/figma-plugin/src/code.ts:424–475`, `apps/figma-plugin/src/ui.html:210–260`: controls remain active; no import lock/cancel token exists. Figma nodes are created incrementally; the catch reports an error but does not remove partial nodes. Repeated imports can overlap and successful roots retain captured coordinates rather than a deliberate insertion location.

Fix: serialize imports, disable input while busy, track created nodes, clean up failed imports and position successful roots predictably. Provide incremental progress and cancel.

## Fidelity and compatibility findings

| ID / priority | Evidence | Consequence and correction |
|---|---|---|
| A11 / P1 | `capture.ts:99`, `parseFloat(opacity) || 1` | Opacity zero becomes one. Preserve zero with finite-value handling. |
| A12 / P2 | `capture.ts:288`, `.trim()` on direct text nodes | Inline whitespace and preformatted text change. Respect computed whitespace and measured text runs. |
| A13 / P2 | `capture.ts:260–284` | Only text-bearing `::before` is approximated using whole-parent geometry; `::after` and decorative pseudo-elements are absent. Capture supported generated content or report it. |
| A14 / P1 | `code.ts:355–387` | Images omit visibility/opacity, strokes/effects and nonuniform radii; object-fit modes largely collapse to FILL. Apply common node properties and accurate image transforms. |
| A15 / P2 | `code.ts:335–344`; SVG `outerHTML` capture | Imported SVG is not resized to measured bounds or assigned visibility. External CSS/currentColor/sprite references may not survive serialization. Resolve styles/resources and size explicitly. |
| A16 / P2 | `code.ts:390–417` | Canvas/video fallback images captured in protocol are ignored and become placeholders. Render available fallbacks and explain only genuine failures. |
| A17 / P2 | `box.ts:35–38,64–86` | Any percentage radius becomes a circle; only top border is read and applied uniformly. Preserve corner percentages and per-edge borders. |
| A18 / P2 | `capture.ts`, scene node types, `code.ts` | No explicit transform, stacking-order or blend/filter pipeline. DOM order and axis-aligned bounds cannot reproduce many overlapping/rotated interfaces. Preserve paint order/transforms and flag unsupported effects. |
| A19 / P2 | `capture.ts:181–195`, childNodes traversal | Every iframe is labeled cross-origin; same-origin content and shadow DOM are not traversed. Add supported traversal and distinguish security boundaries. |
| A20 / P2 | `shared-protocol/src/svg-export.ts` | SVG fallback lacks text wrapping, clipping and effects; uses first fill and approximated text baseline. It cannot replace native editable import or guarantee visual parity. Label limitations and test exports. |
| A21 / P2 | `code.ts` switch vs schema | LINE nodes validate but have no importer branch, so disappear silently. Implement or explicitly reject unsupported schema node types. |
| A22 / P2 | `typography.ts:4–17`, `code.ts:31–70` | First CSS family may not be the rendered font; same-family style fallback is silent and failed requested font combinations are retried repeatedly. Resolve available faces, cache resolved fallbacks, report substitutions once. |

## Performance audit

Small unminified application bundles are a positive starting point: approximately 40.8 KB content script, 30.0 KB popup, 1.9 KB background and 21.4 KB plugin main bundle in this build. Bundle size does not establish capture/import speed.

1. **P1 — Unbounded asset work.** `content.ts:37–63` launches one fetch per image occurrence; `encode.ts` has no abort timeout, byte cap or MIME validation. The dedupe package is not connected to this path. Repeated URLs are fetched and embedded repeatedly. Add URL/content caching, a bounded worker queue, request timeout, individual and total byte budgets, and explicit failure records.
2. **P1 — Main-thread capture.** `captureSubtree` synchronously recurses, reads computed styles and layout for every element and pseudo-element, and measures text ranges. No yielding or depth protection exists in capture. The 2,500 limit does not budget every generated child or stop all remaining iteration. Use a work queue with time slices, cancellation and exact output budgeting. Benchmark before selecting defaults.
3. **P2 — Large transport/storage copies.** Data URLs expand binary assets and are repeated across JSON, runtime messages, storage and clipboard. The last capture may exceed storage/message practical limits. Storage writes are not awaited/checked; the popup can report success without a durable result. Separate assets from nodes and surface quota failures.
4. **P2 — Serial font failures.** Import builds children sequentially and retries missing faces. Preflight unique fonts with bounded concurrency and cache requested-to-resolved mappings. Deduplicate image creation too.
5. **P2 — Misleading time metric.** Capture duration stops before image embedding; displayed time omits network, storage, serialization and Figma reconstruction. Track capture, assets, transfer and import separately, plus end-to-end time.
6. **P2 — Inspector listener accumulation.** Toggling inspector off returns without removing old move/key handlers; later activations add more. Every activation can multiply layout/style work on mousemove. Centralize teardown, make picker/inspector mutually exclusive and throttle inspection to animation frames. Restore original outlines and outline offsets rather than deleting page styling.

No measured capture latency, peak memory, large-page stability or comparative competitor speed result is available. Proposed benchmark set: 100, 1,000 and 2,500 output nodes; repeated assets; 20 MB of images; missing fonts; deep nesting; network stalls; repeated imports. Record p50/p95, longest UI task, bytes and cancellation latency on a named machine.

## UX and visual design audit

**Current strengths:** coherent purple accent, consistent rounded cards, legible primary action and descriptive capture modes. The importer keeps its initial screen simple. The popup’s fixed width is appropriate for its host; the wide background in a browser preview is not an extension layout defect.

**Main usability problems:**

- Six equally prominent tabs compete with the primary export task. Several tabs provide only a capture-first empty state. Group inspection features behind a secondary Inspect area and prioritize capture/export.
- “Copy for Figma (1-Click)” suggests a more direct experience than JSON + a separately installed plugin. Explain the required destination before capture, and use a clear next-step action after success.
- Selecting an element closes the popup; no durable in-page result, progress, retry or automatic return path exists. Add an in-page toolbar and completion card with Copy, Capture again and error recovery.
- Current stats omit the captured page identity/time and display root child count as “Auto Layout Frames” (`popup.ts:151`). Count actual matching frames and identify the source so a stale capture from another tab is obvious.
- Intelligence lists do not clear old values when a new capture has no entries. Show explicit empty states and reset all lists on each capture.
- Clipboard calls lack consistent error handling; success messages can be premature. Await results and provide a file fallback or manual paste field.
- Capture warnings are not prominent in extension results, and import stats omit capture diagnostics. Show partial success, missing images, truncation and font substitution before users assume fidelity.
- The plugin has no manual paste textbox, preview, capture summary, import options, retry, cancellation or locate-result control. Add a concise preflight with page title, dimensions and warnings.
- Text sizes of 10–11px make secondary labels and dense result lists harder to scan. Use a clearer type scale, restrained uppercase labels and fewer simultaneous actions. Replace emoji controls with a consistent icon family.
- Both UIs hardcode dark palettes even though the plugin requests theme colors. Use Figma theme variables for the plugin, and define accessible focus, disabled and busy states.

**Accessibility issues:** tab buttons lack tablist/tab/tabpanel semantics and arrow-key behavior; radio visual selection is click-driven rather than synchronized to all input changes; notices lack live-region roles; color-copy items and the file dropzone are clickable divs without native keyboard interaction; the picker has no keyboard selection method. Make controls semantic, support visible focus, announce progress/errors, and provide a non-pointer path. A full accessibility conformance claim needs testing beyond this source review.

**Recommended primary flow:** open extension → identify source and capture scope → select/capture → show preview, dimensions and quality warnings → export → explicit Figma destination instruction → importer preflight if required → progress → selected imported frame with diagnostic summary.

Keep JSON, SVG and Markdown downloads under an advanced menu. Preserve the original visual identity while making this journey as clear as the competitor’s compact in-page toolbar.

## Privacy, packaging and documentation

- Form redaction is a useful default, but it does not remove sensitive body text, contenteditable content, page title or URL query parameters. Local storage retains the last capture with no clear/delete control. Explain capture scope and provide deletion. “Automatic personal data redaction” currently overstates protection.
- No telemetry/backend calls were found in the reviewed application source. Remote asset fetches still occur during embedding; “local processing” should not imply zero network activity.
- The extension manifest mixes Figma-only fields (`api`, `main`, `ui`, `editorType`) into Chrome’s manifest. The Figma build also copies plugin outputs into the extension dist directory. Separate product packages and validate each manifest/build on clean output directories.
- Chrome commands/context menus send messages without injection fallback or user-facing error handling. Viewport shortcuts receive a response but discard it; content code attempts persistence separately, with no completion surface. Route all entry points through a consistent capture coordinator.
- Firefox packaging is absent. Chrome permissions and static all-site injection deserve a deliberate least-access decision; `activeTab` alone does not describe the existing manifest’s all-site content-script behavior.
- Documentation claims iterative traversal, animation-frame yielding, screenshot copy, Vite bundling and asset warnings that are not implemented as described. It also presents direct-paste feasibility conclusions without reproducible artifacts in the repo. Update docs to match code and avoid unsupported claims about third-party terms or universal pixel accuracy.
- No CI workflow, real browser interaction suite, Figma integration harness or automated visual reference comparison was found. Utility test success is insufficient release evidence.

## Implementation order and release gates

| Phase | Work | Acceptance gate |
|---|---|---|
| 1: Reliable core | A01–A10, opacity, storage errors | Every advertised capture mode completes; valid files import; invalid files do not leave partial canvas nodes; hostile text stays literal |
| 2: Fidelity | Text boxes/runs, safe layout inference, images/SVG, borders, paint order and clipping | Reference fixture exports compared against browser screenshots at desktop and mobile widths; editable text and layouts inspected in Figma |
| 3: Performance | Asset queue/cache/budgets, yielding, font preflight, staged metrics | Benchmark results recorded; bounded resource use; cancellation/retry work during slow network and large imports |
| 4: Product experience | In-page toolbar, onboarding, preflight/preview, semantic controls, theme support | A new user completes capture-to-Figma without guidance; keyboard journey works; errors have actionable recovery |
| 5: Delivery parity | Validate direct-paste approach or streamline supported plugin delivery; browser packages | Tested workflow meets the declared product promise across supported hosts; fallback remains available |

Direct paste is an architectural requirement if exact competitor workflow parity is mandatory. The current JSON route cannot satisfy it through button styling. Run a dedicated feasibility spike, document the actual supported transport and compatibility evidence, and make the promise match the result.

Minimum release matrix: viewport/full page/selected frame/selected image; scrolled page; flex wrap and absolute overlays; grid; long and mixed-style text; missing fonts; repeated and CORS-restricted images; SVG currentColor; pseudo-elements; canvas fallback; same/cross-origin iframe; empty/malformed/oversized JSON; popup closure; keyboard-only controls; repeated/cancelled/failed imports. Test actual Chrome and Figma desktop/web and record platform versions.

The next engineering priority is reliable capture and reconstruction. Visual polish should follow those fixes so the interface accurately represents a trustworthy export.
