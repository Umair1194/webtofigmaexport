# Responsive native export and cancellation — 1.7.3

Native graph construction and record serialization now yield between nodes on an approximately 8 ms work budget. Record serialization uses the existing codec's single-node export option with shared glyph/blob maps and a shared ID counter, preserving hierarchy and native data. This is cooperative main-thread work, not a Web Worker.

Where available, Chrome's [scheduler.yield](https://developer.chrome.com/blog/use-scheduler-yield?hl=en) resumes work without paying a timer delay on every batch. Periodic timer turns also allow ordinary timers and extension messages to run; unsupported browsers use timer continuations. Forced stage boundaries allow cancellation before and after final compression.

Cancellation is connected through both routes:

- Popup: Cancel remains available during native preparation; abort retains the saved capture and restores retry. It is hidden when clipboard writing starts.
- On-page selection/copy: the capture controller's abort travels through a request-scoped broker to the native page job. A cancellation received while the encoder is being injected prevents it from starting. Requests can cancel only their own tab/frame/job. Duplicate jobs are rejected.
- Once clipboard commit starts, late cancellation cannot undo it. The client waits for the actual result and preserves normal successful-copy cleanup; it never reports cancellation while an outstanding job might still write. Failed/cancelled preparation never clears the saved capture.

## Measurements

Same local Chromium environment as 1.7.2: 1440 × 1000 / DPR 1, one discarded warm-up and three measured samples. Candidate report metadata still says 1.7.2 because measurements preceded the 1.7.3 packaging bump; the source includes uncommitted candidate changes. These are engine/decoder harness results, not installed-popup or Figma-host observations.

| Desktop fixture | Previous encode median | New encode median | Previous maximum frame-gap median | New frame-gap median |
| --- | ---: | ---: | ---: | ---: |
| Acceptance | 26 ms | 24 ms | 25 ms | 17 ms |
| 12 cards | 39 ms | 37 ms | 42 ms | 25 ms |
| 60 cards | 88 ms | 88 ms | 100 ms | 33 ms |
| 150 cards | 186 ms | 187 ms | 200 ms | 42 ms |
| Long paragraphs | 70 ms | 67 ms | 83 ms | 33 ms |

No Long Tasks were recorded in the desktop or narrow three-sample core scenarios. Maximum individual recorded frame gap was 50 ms on the large-card scenario. The regression comparator found no count changes, lost structural checks or timing/payload budget violations. All five narrow scenarios also passed; large-card encode median 185 ms, frame-gap median 42 ms.

Stress checks: scheduled DOM capture cancellation passed; capture limit remained 2,500 nodes with partial-capture disclosure; native cancellation scheduled at 20 ms stopped the export after 35.8 ms overall, with response-after-delivered-abort rounded to 0.0 ms at the report's 0.1 ms precision. Eight repeated exports had stable layer counts. This measures response after delivery, not a guarantee that the event loop delivers every cancellation at exactly 20 ms.

## Correctness and validation

222 tests pass, forced typechecking, both builds and quality-lab compilation pass. Tests compare all generated records and glyph blobs against the prior recursive serializer for a nested styled-text fixture, and cover cancellation during real glyph serialization (no clipboard write), popup retry retention, request-scoped relay, duplicate jobs, injection-time cancellation and late commit success. The encoder's new scheduler adds no permissions or dependencies.

Evidence: [desktop](performance-1.7.3/after-1440.json), [narrow](performance-1.7.3/after-768.json), [stress](performance-1.7.3/stress-1440.json). Previous-release baseline: [1.7.2 desktop](performance-1.7.2/after-1440.json).

## Remaining limits

Individual font shaping/vector conversion operations, input validation and final binary compression remain synchronous. Extremely large individual nodes or image payloads may still cause a pause. Yielding occurs between nodes/stages; cancellation cannot interrupt an individual synchronous operation or reverse a clipboard write. No claim is made that all websites are pause-free, or that installed message-broker responsiveness has been independently observed in the browser harness. Actual Figma paste acceptance was not repeated in this batch.

Reload the built extension and refresh source webpages to replace the previous content/clipboard scripts before testing 1.7.3.
