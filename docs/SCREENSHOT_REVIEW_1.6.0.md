# Screenshot fidelity review — 1.6.0

20 October 2026. Pairing: output screenshot 1 with original 4 (Petopus); output 2 with original 3 (Magic Patterns).

## Visible differences

Magic Patterns has much darker panel/button/card outlines, unintended shading along the sidebar, missing green/purple gradient colours in logo/workspace icons and filled-looking shapes where the source has cutouts. Overall page geometry is substantially closer than its paint fidelity.

Petopus has a more transparent-looking information panel, input-text alignment differences and a stray mark inside the unchecked checkbox. The source and output screenshots have different dimensions and display scale; their outer card and split-pane proportions are similar after normalization. Their apparent overall size difference alone does not establish a capture-layout defect.

No live DOM/capture JSON for these exact new examples was supplied. The causal matches below are code defects reproduced independently, rather than proof that every differing pixel has the same cause.

## Implemented fixes

| Observed issue | Defect found | Change |
| --- | --- | --- |
| Dark borders | Native strokes retained alpha in the colour rather than the paint opacity; all four CSS edges also became four overlaid paints. | Normalize solid paint alpha and use one shared border paint with independent edge weights. Distinct colours per edge currently use the first shared paint with a warning. |
| Large/unwanted shading | Shadow parser extracted only RGB functions, then parsed numbers inside modern colour functions as geometry. | Balanced colour tokens, independent length parsing, modern colours, hex/named colours and transparent-shadow removal. |
| Missing gradient icon colours | SVG URL paint references were skipped. | Native linear/radial SVG gradients, stops and alpha; local references, inherited definitions, object-bounding-box/user-space units and transforms. Capture preserves computed stop colours and local bounds. |
| Filled-looking cutouts | Each path contour became a separate filled region; network winding always used nonzero. | Preserve multiple contours in one region and retain even-odd winding. |
| Square SVG gradient tiles | Rounded SVG rectangles were converted to square paths. | Preserve circular/elliptical rounded corners as editable curved paths. |
| SVG alpha mismatch | SVG solids overrode colour alpha with fill/stroke opacity, and captured root opacity could be applied twice. | Multiply paint opacity by source alpha once; normalize captured SVG root opacity because the parent already carries it. |
| Petopus panel transparency/blur | Backdrop blur was not captured. | Simple CSS backdrop-filter:blur(px) becomes a native BACKGROUND_BLUR effect. This supports that feature; the exact source panel's CSS is not confirmed from a screenshot alone. |
| Input/checkbox mismatch | Text used a hard-coded 8px inset and arbitrary placeholder opacity; checkbox values could become text. | Use actual padding/border and line height, placeholder colour/opacity, and explicit checkbox/radio state handling. Unchecked controls do not contain value text. |

## Verification

- 166 tests across 22 files passed, including real native encoder/decoder checks for translucent border paints, SVG gradient stops/transforms, even-odd geometry, inherited definitions and background blur. Capture tests check input geometry, checkbox state and root SVG opacity. Shadow tests cover modern colour functions and transparent utility layers.
- Forced type checking, both builds and the native browser no-eval/no-Wasm probe passed. Source and built Chrome manifests are version 1.6.0.
- A real Chromium fixture captured the same classes of paint/control patterns and decoded the resulting native data. It verified a single 10%-opacity border paint, a 2px/8%-opacity shadow, two SVG colour stops, a 45px input-text inset, an empty unchecked checkbox and a 12px background blur.
- [Browser evidence](paint-fidelity-1.6.png). Run `node scripts/preview-paint-fidelity.mjs` to reproduce. The fixture writes no clipboard data and performs no Figma actions.
- Actual Figma rendering and a fresh capture of the exact supplied sites remain unverified. This fixture checks captured/encoded properties; its screenshot is not a corrected Figma export of the user's pages.

## Remaining boundaries

SVG masks/clips, external symbols, repeating gradient spread, focal-point radial geometry, nested SVG viewport behaviour and unusual percentage rounded radii remain limited. Standalone SVG curve bounds are sampled when capture-time getBBox data is unavailable. Original web-font substitution, browser-native control styling and CSS background positioning can still differ. Background blur strength in Figma requires visual acceptance, and combined backdrop filters produce a warning.

Reload the unpacked extension, verify v1.6.0, refresh both source pages and make fresh captures. Match viewport dimensions before comparing source and paste; inspect the thin borders, sidebar shadow, coloured icons, input text and checkbox first.
