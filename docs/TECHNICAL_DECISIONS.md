# Technical decisions

## Delivery

The supported editable delivery path is versioned scene JSON → FrameForge Figma plugin → native Figma API nodes. Plain JSON on the system clipboard does not provide plugin-free editable native paste. The plugin accepts clipboard text, manual JSON paste and local files, with a review step before import.

SVG is an explicitly limited fallback. No proprietary Figma clipboard transport is implemented. Competitor native-paste parity requires a separate validated transport implementation; the current product does not claim it.

## Build

npm workspaces and TypeScript organize shared packages and applications. esbuild bundles the two applications. Vitest and Happy DOM provide unit and DOM integration coverage. Real Figma rendering and installed-extension acceptance remain manual integration checks.

## Fidelity and resource use

Capture uses CSS pixels and explicit root clipping. Editable text retains its measured box. Simple inferred Auto Layout is retained only when measured child geometry is preserved; ambiguous layouts use absolute positions. Fonts resolve through Figma with cached fallbacks and diagnostics.

The asynchronous traversal yields between batches. Capture and import use node/depth budgets and cancellation. Image downloads have bounded concurrency, byte caps, timeout and URL caching. Missing assets remain explicit placeholders with diagnostics.

See [verification and remaining gaps](FIXES_AND_VERIFICATION.md) for supported behavior and limitations. The original audit remains a record of the pre-fix implementation.
