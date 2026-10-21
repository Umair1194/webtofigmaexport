import {
  AutoLayoutConfig,
  CounterAxisAlign,
  LayoutMode,
  PrimaryAxisAlign,
} from "@frameforge/scene-graph";
import { parsePx } from "@frameforge/style-normalizer";

export function inferAutoLayout(
  computedStyle: CSSStyleDeclaration | Record<string, string>,
  childCount: number
): AutoLayoutConfig | undefined {
  const display = (computedStyle.display || "").toLowerCase();
  const isFlex = display === "flex" || display === "inline-flex";

  if (!isFlex || childCount === 0) {
    return undefined;
  }

  const flexDirection = (computedStyle.flexDirection || "row").toLowerCase();
  if (flexDirection.includes("reverse") || (computedStyle.flexWrap && computedStyle.flexWrap !== "nowrap")) return undefined;
  const isVertical = flexDirection.includes("column");
  const layoutMode: LayoutMode = isVertical ? "VERTICAL" : "HORIZONTAL";

  // Item spacing from gap
  const gapStr = isVertical
    ? computedStyle.rowGap || computedStyle.gap || "0px"
    : computedStyle.columnGap || computedStyle.gap || "0px";
  const itemSpacing = parsePx(gapStr);

  // Paddings
  // CSS content starts inside the border; Figma's layout padding excludes its stroke.
  const paddingTop = parsePx(computedStyle.paddingTop || "0px") + parsePx(computedStyle.borderTopWidth || "0px");
  const paddingRight = parsePx(computedStyle.paddingRight || "0px") + parsePx(computedStyle.borderRightWidth || "0px");
  const paddingBottom = parsePx(computedStyle.paddingBottom || "0px") + parsePx(computedStyle.borderBottomWidth || "0px");
  const paddingLeft = parsePx(computedStyle.paddingLeft || "0px") + parsePx(computedStyle.borderLeftWidth || "0px");

  // Primary Axis Alignment (justify-content)
  const justify = (computedStyle.justifyContent || "flex-start").toLowerCase();
  let primaryAxisAlignItems: PrimaryAxisAlign = "MIN";
  if (justify.includes("center")) primaryAxisAlignItems = "CENTER";
  else if (justify.includes("flex-end") || justify.includes("end")) primaryAxisAlignItems = "MAX";
  else if (justify.includes("space-between")) primaryAxisAlignItems = "SPACE_BETWEEN";

  // Counter Axis Alignment (align-items)
  const align = (computedStyle.alignItems || "stretch").toLowerCase();
  let counterAxisAlignItems: CounterAxisAlign = "MIN";
  if (align.includes("center")) counterAxisAlignItems = "CENTER";
  else if (align.includes("flex-end") || align.includes("end")) counterAxisAlignItems = "MAX";
  else if (align.includes("baseline")) counterAxisAlignItems = "BASELINE";

  // Flex wrap
  const flexWrap = (computedStyle.flexWrap || "nowrap").toLowerCase();
  const layoutWrap = flexWrap === "wrap" ? "WRAP" : "NO_WRAP";

  return {
    layoutMode,
    itemSpacing,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    primaryAxisSizingMode: "FIXED",
    counterAxisSizingMode: "FIXED",
    layoutWrap,
    inferredConfidence: 0.8,
  };
}
