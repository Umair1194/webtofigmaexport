# FrameForge Limitations & Technical Boundaries

FrameForge is designed to be transparent and honest about browser, DOM, and Figma capabilities. Rather than failing silently or producing misleading visual glitches, known constraints are handled with explicit diagnostics.

---

## 1. Browser & Chrome Security Boundaries

### Restricted Chrome Pages
- Webpages starting with `chrome://`, `chrome-extension://`, `devtools://`, or the Chrome Web Store (`chromewebstore.google.com`) strictly disallow content script injection by Chrome's security model.
- **Handling**: The FrameForge popup displays a polite error banner: *"Chrome restricts extension access on internal browser and Web Store pages. Please navigate to a standard HTTP or HTTPS website."*

### Cross-Origin Iframes
- Browser Same-Origin Policy (SOP) prevents scripts from inspecting `contentDocument` or `window.getComputedStyle` on third-party frames (e.g. YouTube embeds, Stripe iframes, third-party ads).
- **Handling**: FrameForge captures the outer geometry of the `<iframe>`, sets its placeholder background, and attaches an `UnsupportedNode` with `reason: "CROSS_ORIGIN_IFRAME"`.

### Canvas & WebGL Content
- `<canvas>` elements and 3D WebGL scenes contain raster or shader pipelines rather than semantic DOM nodes.
- **Handling**: Exported as an image/snapshot fill when accessible, or tagged with `reason: "CANVAS_ELEMENT"`.

---

## 2. Figma Import Boundaries

### Font Availability & System Fonts
- Figma requires fonts to be registered in its font library before assigning text characters or typographic properties via `figma.loadFontAsync()`.
- If a web font (e.g. custom corporate webfont or Adobe Typekit) is not installed locally on the user's machine or present in Google Fonts, Figma's API throws an error when attempting to load it.
- **Handling**: FrameForge catches font load failures, gracefully substitutes `Inter` (or `Roboto`), and lists the substituted fonts in the Import Summary report.

### CSS Grid vs. Figma Auto Layout
- CSS Grid allows overlapping items, dynamic template areas (`grid-template-areas`), implicit tracks, and subgrids. Figma's Auto Layout currently supports 1D flows (Horizontal / Vertical) with wrapping.
- **Handling**: Simple 1D flex layouts are inferred as native Auto Layout. Complex multi-track or overlapping CSS Grid layouts are positioned using exact absolute positioning (`layoutMode = "NONE"`) to guarantee pixel-perfect visual fidelity.

### Advanced CSS Filters & Blend Modes
- CSS supports filters like `invert()`, `sepia()`, `contrast()`, `saturate()`, and `hue-rotate()`. Figma supports Layer Blur, Background Blur, and standard blend modes (Multiply, Screen, Overlay, etc.).
- **Handling**: Blurs and supported blend modes are converted directly. Complex color matrix filters (`hue-rotate`, `invert`) are approximated or noted in diagnostics.

### CORS-Restricted Remote Images
- Images served without `Access-Control-Allow-Origin: *` cannot be converted to base64 data URIs inside the webpage canvas due to canvas tainting.
- **Handling**: The image element geometry is preserved, and a placeholder image with the remote URL reference is supplied. The asset inventory flags the asset as requiring CORS bypass or manual download.

---

## 3. Form Inputs & Dynamic States

### Redacted Form Values
- Passwords, credit card inputs, personal data, and typed text values are redacted during extraction.
- The input container styling, border, background, and placeholder text are preserved.
