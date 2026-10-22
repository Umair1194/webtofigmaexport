# Privacy and data handling

FrameForge has no telemetry, analytics, cloud capture service or account backend in the current implementation. Capturing and scene reconstruction run locally.

Image embedding requests assets from their original hosts. Page requests may use the current session for same-origin images. Cross-origin requests and background retries omit credentials; cookies, tokens and page headers are not forwarded to the broker. The extension uses its existing host permissions for bounded background retries. Readable loaded images can be rasterized locally. Asset hosts receive ordinary network requests. Protected images and browser pixel-access restrictions can still prevent embedding.

Web-font matching may request referenced stylesheets and font files from their original hosts using ordinary CORS fetches. Same-origin requests may use the page session; cross-origin requests omit credentials. Captures can temporarily retain bounded font data alongside page content. Clipboard exports contain shaped glyph data and font names; they do not install those fonts in Figma. No local/system font enumeration or new permissions are requested.

Form input/textarea values are replaced with placeholders or redaction marks. This is not general personal-data detection: ordinary DOM text, contenteditable text, image content, page titles and URLs may contain private information and are included in captures. Review the source before exporting.

The latest capture is stored temporarily in Chrome local extension storage. A successful native **Copy to Figma** clears the matching saved capture automatically. Failed copies retain it for retry; **Discard** removes it manually. A newer capture from another tab is preserved. These controls do not delete downloaded files or clipboard contents. Secondary JSON/SVG exports do not automatically clear a capture. Importing into Figma places captured content into the current Figma document, where the document's normal sharing rules apply.

Captured/imported strings are displayed using text nodes, and the importer validates nested fields and resource budgets before creating canvas layers. These protections do not turn an arbitrary capture into a trusted document.
