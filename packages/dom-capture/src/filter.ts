const IGNORED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "META",
  "LINK",
  "HEAD",
  "BR",
  "WBR",
]);

export function shouldSkipElement(
  element: Element,
  computedStyle: CSSStyleDeclaration,
  options?: { includeHidden?: boolean }
): boolean {
  const tagName = element.tagName.toUpperCase();

  if (IGNORED_TAGS.has(tagName)) {
    return true;
  }

  // Skip FrameForge extension UI overlays
  const hasOverlayClass =
    typeof element.classList?.contains === "function"
      ? element.classList.contains("frameforge-overlay")
      : typeof (element as any).className === "string"
      ? (element as any).className.includes("frameforge-overlay")
      : false;

  const hasIgnoreAttr =
    typeof element.getAttribute === "function" &&
    element.getAttribute("data-frameforge-ignore") === "true";

  if (
    element.id?.startsWith("frameforge-") ||
    hasOverlayClass ||
    hasIgnoreAttr
  ) {
    return true;
  }

  // Inside an SVG element: child shapes should be serialized together with the <svg> root
  if ("ownerSVGElement" in element && (element as SVGElement).ownerSVGElement) {
    return true;
  }

  if (!options?.includeHidden) {
    if (computedStyle.display === "none") {
      return true;
    }
    if (computedStyle.visibility === "hidden" || computedStyle.visibility === "collapse") {
      return true;
    }
  }

  return false;
}
