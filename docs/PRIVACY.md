# FrameForge Privacy & Security Architecture

## 1. Core Principles

FrameForge adheres to a strict **Local-First, Zero-Telemetry, Privacy-Preserving** model:
1. **Zero Remote Transmission**: Captured DOM, styles, text, screenshots, and metadata are processed entirely on your machine. No data is sent to external servers or cloud APIs.
2. **Minimal Permissions**: Uses Manifest V3 scoped permissions (`activeTab`, `scripting`, `storage`). Does not request broad access to all websites (`<all_urls>`).
3. **Sensitive Form Data Redaction**: Automatically suppresses typed input values, passwords, credit card fields, and auth tokens.
4. **No Third-Party Analytics**: No Google Analytics, Mixpanel, Sentry, or tracking pixels.

---

## 2. Chrome Extension Permissions Explained

| Permission | Reason for Request |
| :--- | :--- |
| `activeTab` | Grants temporary access to the active webpage only when the user explicitly clicks the FrameForge extension icon or opens the popup. |
| `scripting` | Enables injecting the DOM capture script and the interactive element-selection highlight overlay into the active tab. |
| `storage` | Saves user preferences (e.g. default capture mode, Auto Layout inference sensitivity, theme) locally in Chrome `storage.local`. |

---

## 3. Form Redaction Rules

During DOM traversal, form controls are filtered as follows:
- `<input type="password">`: Value is completely stripped; replaced with empty string or placeholder bullets.
- `<input type="text">`, `<textarea>`: Replaces entered user text with placeholder text or sanitized generic text unless the user explicitly toggles raw capture in development mode.
- Attributes like `autocomplete`, `name="cardnumber"`, `name="cvv"`, `name="ssn"`, `name="token"`: Automatically stripped.
- Local Storage, Session Storage, Cookies, and IndexedDB: **Never inspected or captured**.

---

## 4. Figma Plugin Security

The companion Figma plugin runs inside Figma's sandboxed environment:
- Reads the validated Scene Graph JSON provided by the user via clipboard or file drop.
- Runs schema validation before executing any `figma.*` node creation calls.
- Does not make external network requests.
