# Stacking and single-line text — 1.7.5

The reported Foundations capture painted the Colour heading over the sticky toolbar, allowed sidebar entries to show beneath its footer, and wrapped Editorial accent outside its badge.

## Changes

- Capture positioned CSS z-index values and preserve them through validation. Native export orders resolved overlays above normal content without reordering normal Auto Layout flow children.
- Treat sticky elements as positioned snapshots at the captured scroll position. Their descendants retain eligible Auto Layout, while the sticky wrapper stays out of reconstructed document flow.
- Clip scroll/auto overflow panes, as well as hidden/clip panes, to stop out-of-pane content appearing over adjacent controls.
- Export single-line nowrap/pre text as native auto-width text. Remove both measured and serializer-inherited stretch from those text layers. Ordinary paragraphs retain height resizing and editable wrapping.
- The optional JSON importer also recognizes the new text auto-width hint.

## Verification

- 238 tests pass across 33 files. Added capture/validation tests for sticky priority, scroll clipping and nowrap versus paragraph sizing; native payload tests cover overlay paint order with negative and positive priorities, unchanged normal flow order, and auto-width labels without stretch.
- Forced TypeScript build, both production builds and quality-lab bundle compilation pass.
- Read the live Foundations source and tested a rendered snapshot at 1800 × 1010, scrolled 837px so Colour occupies the toolbar's region. The harness uses production capture, font collection, validation, native serialization and binary decoding. It exported 1,617 layers, 454 text layers and 919 Auto Layout frames.
- Pasted the complete native HTML into the user-authorized Figma test file on the separate page **FrameForge stacking · 1.7.5**. The first host check exposed an additional stretch override, which was corrected before the final paste.
- Final Figma inspection shows an opaque toolbar over the scrolled heading, a clean sidebar footer and a one-line Editorial accent badge. Figma's inspector reports native Inter Semi Bold 13px text, Auto width selected, horizontal Hug and vertical Hug. Existing project pages were not edited.

Evidence: [decoded browser report](stacking-1.7.5/browser-report.json), [source snapshot](stacking-1.7.5/source.jpg), [Figma overview](stacking-1.7.5/figma-overview.jpg), [editable badge inspector](stacking-1.7.5/figma-badge.jpg).

## Scope and remaining limits

This verifies the reported page and regression cases, not every CSS stacking context. Export preserves a static scroll snapshot, not interactive browser scrolling or sticky behavior inside Figma. Arbitrary cross-ancestor stacking contexts, mixed overflow rules on only one axis, and complex CSS paint phases can still differ. Current native flow children retain layout order rather than being rearranged solely for z-index. The source requests Plus Jakarta Sans without accessible matching font data in this harness, so the existing explicit Inter fallback warning remains.

The Figma test used the production engine and a native clipboard bridge; it did not automate the installed extension's popup, permissions or storage. Reload extension version 1.7.5 and the webpage, discard an older saved capture and capture again. Old capture JSON does not contain the new stacking and nowrap hints.
