export const SCHEMA_VERSION = "1.0.0";

export type NodeType =
  | "FRAME"
  | "TEXT"
  | "RECTANGLE"
  | "IMAGE"
  | "VECTOR"
  | "LINE"
  | "UNSUPPORTED";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RGBAColor {
  r: number; // 0 to 1
  g: number; // 0 to 1
  b: number; // 0 to 1
  a: number; // 0 to 1
}

export interface SolidPaint {
  type: "SOLID";
  color: RGBAColor;
  opacity?: number;
  visible?: boolean;
}

export interface ColorStop {
  position: number; // 0 to 1
  color: RGBAColor;
}

export interface LinearGradientPaint {
  type: "GRADIENT_LINEAR";
  angleDegrees: number;
  stops: ColorStop[];
  visible?: boolean;
}

export type Paint = SolidPaint | LinearGradientPaint;

export interface StrokeStyle {
  color: RGBAColor;
  width: number;
  alignment: "INSIDE" | "OUTSIDE" | "CENTER";
  style?: "solid" | "dashed" | "dotted";
}

export interface CornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
  isUniform: boolean;
}

export interface ShadowEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: RGBAColor;
  offset: { x: number; y: number };
  radius: number; // blur radius
  spread: number;
  visible?: boolean;
}

export interface BlurEffect {
  type: "LAYER_BLUR" | "BACKGROUND_BLUR";
  radius: number;
  visible?: boolean;
}

export type Effect = ShadowEffect | BlurEffect;

export type LayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL";
export type PrimaryAxisAlign = "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
export type CounterAxisAlign = "MIN" | "CENTER" | "MAX" | "BASELINE";
export type SizingMode = "FIXED" | "AUTO";

export interface AutoLayoutConfig {
  layoutMode: LayoutMode;
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  primaryAxisAlignItems?: PrimaryAxisAlign;
  counterAxisAlignItems?: CounterAxisAlign;
  primaryAxisSizingMode?: SizingMode;
  counterAxisSizingMode?: SizingMode;
  layoutWrap?: "NO_WRAP" | "WRAP";
  inferredConfidence: number; // 0 to 1
}

export interface BaseNode {
  id: string;
  name: string;
  type: NodeType;
  bounds: BoundingBox;
  visible: boolean;
  opacity: number; // 0 to 1
  zIndex?: number;
  sourceTag?: string;
  sourceRole?: string;
  sourceClasses?: string[];
  attributes?: Record<string, string>;
}

export interface FrameNode extends BaseNode {
  type: "FRAME";
  children: SceneNode[];
  fills: Paint[];
  strokes?: StrokeStyle[];
  cornerRadius?: CornerRadius;
  effects?: Effect[];
  clipsContent?: boolean;
  autoLayout?: AutoLayoutConfig;
}

export interface TypographyStyle {
  fontFamily: string;
  fontWeight: number; // 100 - 900
  fontStyle?: "normal" | "italic";
  fontSize: number;
  lineHeight?: {
    unit: "PIXELS" | "PERCENT";
    value: number;
  };
  letterSpacing?: {
    unit: "PIXELS" | "PERCENT";
    value: number;
  };
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";
}

export interface TextNode extends BaseNode {
  type: "TEXT";
  characters: string;
  style: TypographyStyle;
  fills: Paint[];
}

export interface RectangleNode extends BaseNode {
  type: "RECTANGLE";
  fills: Paint[];
  strokes?: StrokeStyle[];
  cornerRadius?: CornerRadius;
  effects?: Effect[];
}

export interface LineNode extends BaseNode {
  type: "LINE";
  strokes: StrokeStyle[];
}

export interface ImageNode extends BaseNode {
  type: "IMAGE";
  srcUrl?: string;
  dataUrl?: string; // base64 representation if inlined
  assetId?: string; // reference to asset in pipeline
  objectFit: "COVER" | "CONTAIN" | "FILL" | "NONE";
  cornerRadius?: CornerRadius;
  strokes?: StrokeStyle[];
  effects?: Effect[];
}

export interface VectorNode extends BaseNode {
  type: "VECTOR";
  svgContent: string;
  fills?: Paint[];
  strokes?: StrokeStyle[];
}

export interface UnsupportedNode extends BaseNode {
  type: "UNSUPPORTED";
  reason:
    | "CANVAS_ELEMENT"
    | "WEBGL_ELEMENT"
    | "CROSS_ORIGIN_IFRAME"
    | "VIDEO_ELEMENT"
    | "PLUGIN_OR_EMBED"
    | "TOO_COMPLEX";
  description: string;
  fallbackImageUrl?: string;
}

export type SceneNode =
  | FrameNode
  | TextNode
  | RectangleNode
  | LineNode
  | ImageNode
  | VectorNode
  | UnsupportedNode;

export interface ViewportMeta {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
}

export interface CaptureDiagnostics {
  totalNodesCaptured: number;
  totalTextNodes: number;
  totalImages: number;
  totalVectors: number;
  totalUnsupported: number;
  warnings: string[];
  durationMs: number;
}

export interface SceneGraphDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  url: string;
  capturedAt: string; // ISO 8601
  captureMode: "FULL_PAGE" | "VIEWPORT" | "SELECTED_ELEMENT";
  viewport: ViewportMeta;
  root: FrameNode;
  diagnostics: CaptureDiagnostics;
}
