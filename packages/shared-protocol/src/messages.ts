import { SceneGraphDocument } from "@frameforge/scene-graph";

export type MessageType =
  | "START_ELEMENT_PICKER"
  | "CANCEL_ELEMENT_PICKER"
  | "ELEMENT_PICKED"
  | "EXECUTE_CAPTURE"
  | "CAPTURE_SUCCESS"
  | "CAPTURE_ERROR"
  | "TOGGLE_INSPECT_MODE"
  | "INSPECT_HOVER"
  | "PING"
  | "PONG";

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface CapturePayload {
  mode: "FULL_PAGE" | "VIEWPORT" | "SELECTED_ELEMENT";
  redactForms?: boolean;
  inferAutoLayout?: boolean;
}

export interface InspectHoverData {
  tagName: string;
  selector: string;
  dimensions: { width: number; height: number };
  padding: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
  colors: {
    color: string;
    backgroundColor: string;
  };
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
  };
  contrast?: {
    ratioFormatted: string;
    aaPass: boolean;
    uncertain: boolean;
  };
}

// Old captures may contain only a full-page iframe placeholder, not its content.
export function hasDominantIframePlaceholder(root: import("@frameforge/scene-graph").SceneNode): boolean {
  const area = root.bounds.width * root.bounds.height;
  if (area <= 0) return false;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (!node.visible || node.opacity === 0) continue;
    if (node.type === "UNSUPPORTED" && node.reason === "CROSS_ORIGIN_IFRAME" && node.bounds.width * node.bounds.height >= area * 0.8) return true;
    if (node.type === "FRAME") stack.push(...node.children);
  }
  return false;
}
