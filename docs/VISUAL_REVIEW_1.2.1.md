# Petopus export: detailed visual review and text-layout correction

Reviewed the latest exported screenshot against the earlier browser reference. The screenshots use different viewport/image dimensions, so this review compares the card's internal proportions and element relationships rather than claiming a pixel-difference score.

## Findings from the supplied screenshots

| Priority | Location | Visible failure | Cause and correction |
| --- | --- | --- | --- |
| P1 | Main heading and subtitle | “What brings you to Petopus?” gains a second line. “Petopus?” then paints across the subtitle. The reference heading is a single line. | The text node kept its captured height but the exporter rewrapped its text using bundled-font advances. Browser line fragments are now retained and explicitly positioned. A measured one-line heading stays one line; glyph width fits the browser's measured run instead of adding a new line. |
| P1 | Privacy note at the bottom of the photo panel | The normal-weight continuation paints over the bold “How you sign in stays private.” phrase. Subsequent text appears on the wrong first-line origin. | A DOM text node continuing after an inline bold element can start partway across one line and at the left edge on the next. A union bounding box discards that information. Capture now records each fragment's UTF-16 character range and its actual local X/Y/width/height. Export preserves the separate origins. |
| P2 | Text baselines throughout the page | Using CSS line height as the painted text rectangle can shift the initial baseline, even when the number of lines is correct. | Measured fragments now place baselines using the browser text rectangle, with font ascent/descent and the original line height retained for text metadata. This is covered by spacing checks, but the final Figma appearance still requires host verification. |
| P2 | Editable text selection after an indented first line | A line origin added twice to character offsets could misplace the caret/selection, independently of glyph rendering. This is a code finding, not something proved by the screenshot. | Character offsets are now relative to the start of each line; the first-line indent is stored only in the line/glyph positions. |
| P2 | Font fidelity | Matching line breaks alone does not establish matching typeface shapes. | The current exporter still uses bundled Inter for other captured families and reports substitution. Glyph widths fit measured fragments for initial rendering; later editing/reflow in Figma can differ from the website if the original font differs. |

## What now appears substantially closer

The latest screenshot contains the previously missing logo text, headings, option labels, descriptions, step labels, privacy text, and stroked icons. The main two-column card, photograph, step panel, selected account background, radio states, information box, and continue-button hierarchy are present. These are visual observations, not certification of every color, shadow, radius, image crop, or editable-layer property.

The main overlap is a text-line reconstruction defect. Adding arbitrary extra spacing under the heading would mask the symptom while retaining the incorrect wrap. Moving the sidebar text downward would similarly leave its inline geometry wrong. The correction therefore preserves measured browser line geometry rather than changing the page's intended spacing.

## Implementation

- Added optional `fragments` to TEXT nodes. Each fragment has ordered, non-overlapping UTF-16 offsets and finite bounds relative to that text node.
- Captured character ranges in the browser to retain line transitions, inline continuation indents, and fractional geometry. Whitespace normalization maps back to raw DOM offsets and preserves nonbreaking spaces. Long runs yield during capture so cancellation can still run.
- The native text shaper uses measured fragment breaks/origins and fits glyph advances/outlines to the measured run width. It does not rewrap those fragments with fallback font metrics.
- Legacy captures without fragments use a conservative line-capacity fallback to avoid turning a one-line heading box into two lines. They cannot recover exact inline continuation positions from data that was never captured.
- Shared validation retains and checks the new fragment metadata, including data returned from embedded-frame capture.
- Extension version: **1.2.1**.

## Verification and its limits

- **102 tests across 15 files pass.** New regressions cover collapsed whitespace mappings, nonbreaking spaces, pre-line text, surrogate-pair offsets, mixed-inline first/second line origins, single-line heading preservation, legacy heading height, malformed fragment ranges, and line-relative caret offsets.
- Type checking and both builds pass.
- The browser-targeted native-export bundle passes the no-eval/no-Wasm Node VM probe.
- A real in-app Chromium browser ran the capture engine and native encoder against a fixture with the same two failure patterns. The heading stayed on one line. The inline continuation retained X=229.390625 on its first line and X=0 on its next, with 24px baseline spacing. Four editable TEXT records were encoded. This is a browser-DOM-to-native-data check, **not a Figma rendering test**.
- No corrected paste has been visually inspected on a live Figma canvas in this session. The previous computer-use permission denial still limits that verification. Do not treat a passing decoder test as proof of exact Figma appearance.

![Real-browser fixture and native-data checks; this is not a Figma screenshot](</Users/apple/Downloads/browser extentions/export-web-to-figma/docs/text-layout-browser-regression.png>)

To reproduce the browser check, run `node scripts/probe-text-browser.mjs --serve` and open `http://127.0.0.1:38473`. The fixture uses Arial while native export uses Inter, deliberately testing a font-metric mismatch.

## Required fresh-capture acceptance

1. Reload extension version 1.2.1, refresh the source page, and make a new capture. Copying the old saved capture again cannot recover its missing browser fragments.
2. Paste the new capture beside the existing result at the same source viewport size.
3. Confirm the heading is one line and the subtitle has a clear separate baseline.
4. Confirm the privacy continuation starts after the bold phrase and wraps to the next line without overprinting it.
5. Edit the heading and privacy note, inspect their text bounds and Auto Layout parents, and compare the behavior with the source. Font substitution remains a material limitation for subsequent editing.
