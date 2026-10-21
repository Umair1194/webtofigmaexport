# FrameForge 1.7.1: incomplete-capture recovery

The popup restores the last saved capture after reopening. Reloading the extension or website does not itself replace that capture. An incomplete result previously hid the fresh-capture action below a long recovery paragraph, a disabled copy action and diagnostics. It now offers Capture again directly in that card, hides its unusable copy action, and shows the saved capture's date and time. Copy and cleanup behavior for a valid capture is unchanged. The extension manifest/package version is 1.7.1 so the installed build can be identified.

## Verification

- 206 tests, forced TypeScript check and both builds pass.
- Regression checks direct retry of an incomplete saved capture invokes a fresh capture, copies the valid result and clears saved data.
- Read-only inspection of the live Magic Patterns design frame found badge radii serialized as `1.67772e+07px`, with 22px element height.
- A local snapshot of the rendered frame (HTML and original external CSS; site scripts removed) was captured using current production code, validated and encoded as native Figma clipboard HTML: 454 captured nodes, 126 text nodes, 63 vectors, zero unsupported nodes; 731 exported layers, 332 Auto Layout frames. The actual installed extension's iframe message broker was not exercised. Font warning: Plus Jakarta Sans substituted with bundled Inter.
- Reproduction metrics: [magic-rendered-snapshot.json](quality-1.7.1/magic-rendered-snapshot.json).

The user's repeated warning has the same invalid radius field paths. Current radius output is bounded to the validator's contract; those warnings therefore point to an older saved result or older running capture code. Exact installed state remains unverified because that browser is unavailable through the current automation connection.

To test the updated installed extension, reload the extension from apps/chrome-extension/dist, verify 1.7.1, refresh the website, and explicitly click Capture again. Merely reopening the popup restores its saved result.

The user subsequently reported that the installed real-website capture flow is working perfectly and marked that verification step done. This is recorded as user verification; the agent did not independently observe the installed-browser route.
