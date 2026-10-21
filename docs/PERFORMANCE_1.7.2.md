# Performance and responsiveness audit — 1.7.2

Measured 21 October 2026 using the real capture, image normalization, native encoder and decoder in the local browser lab. Desktop: 1440 × 1000 CSS px, DPR 1, Chromium 155, macOS, 10 reported CPU threads. One discarded warm-up, three measured samples per scenario. Before and after use the same environment and fixture; the comparator reports no regression-budget violations or changed layer counts. Reports carry the 1.7.1 version because measurements preceded the 1.7.2 packaging bump. The revision is the last commit plus uncommitted work, not a claim that these changes are committed.

## Result and changes

Repeated font layout and glyph outline conversion were a significant cost. Text runtime now caches layout by font face and text, and outlines by glyph and size, within each export only. Retention is bounded: 256 layout entries, 32,768 text characters, 512 characters per entry; 1,024 outline entries and 40,000 outline commands. Returned glyph geometry remains independent and caches are discarded between exports. Global font-face keys now use normalized weights, bounding that existing cache to the 18 bundled weight/style combinations.

| Scenario | Median native encode before | After | Change |
| --- | ---: | ---: | ---: |
| Visual fixture | 27 ms | 26 ms | −4% |
| 12 cards | 35 ms | 39 ms | +4 ms, within noise/review threshold |
| 60 cards | 108 ms | 88 ms | −19% |
| 150 cards | 246 ms | 186 ms | −24% |
| Long paragraphs | 198 ms | 70 ms | −65% |

On 150 cards, median observed Long Task duration fell from 265 to 203 ms. On long paragraphs it fell from 213 to 86 ms. Large exports still cause synchronous UI pauses. DOM traversal already yields at roughly 8 ms intervals, but native serialization/compression remains synchronous. Moving that work to a worker or carefully slicing serialization is the next responsiveness priority; it is not implemented or claimed solved here. Cancellation is supported during DOM capture, not during synchronous native serialization.

## Stress checks

- 1,050 cards / 6,302 source elements: a scheduled abort stopped capture in 9.7 ms overall, 0.5 ms after the abort callback ran.
- Same page, node-budget check: stopped at exactly 2,500 captured nodes and disclosed a partial capture.
- Eight successive 150-card captures/exports/decodes: stable layer counts; export times about 184–232 ms, with the first run slowest.
- Sampled JS heap rose and fell between runs; maximum observed sample was 146,386,539 bytes (about 140 MiB). Repeated drops were observed, but these samples do not prove the absence of leaks. They include verification decoding and harness data retention, omit transient synchronous peaks, and do not measure process memory.
- Five core browser scenarios also passed at 768 × 1000; largest repeated-card export median 181 ms and long-paragraph median 64 ms. Narrow results have no new matching pre-change baseline, so no narrow improvement percentage is claimed.

## Validation and limits

209 tests pass, including cache isolation, independent glyph geometry and font-size separation. Forced typecheck, both builds and lab compilation pass. Ten browser scenarios and the desktop stress checks passed. No new permissions or dependencies.

The local lab exercises production engines, not the installed Chrome popup/message broker or actual OS clipboard latency. It uses tiny cached local images, not CDN downloads. Thus it cannot establish installed-popup responsiveness, service-worker memory, cold-start speed, or real network performance. Figma canvas rendering was not repeated in this performance batch. The user separately reported the previously failing installed-extension real-site flow working; that is user verification, not an agent-observed result of these stress tests.

Evidence: [before desktop](performance-1.7.2/before-1440.json), [after desktop](performance-1.7.2/after-1440.json), [narrow](performance-1.7.2/after-768.json), [stress](performance-1.7.2/stress-1440.json).

Reproduce with `npm run quality:serve`, run the core suite at the recorded dimensions, then select Run stress checks. The lab disables controls until fonts and fixtures are ready, preventing startup clicks from racing initialization.
