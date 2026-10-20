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
