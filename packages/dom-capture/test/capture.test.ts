import { describe, expect, it } from "vitest";
import { generateLayerName, inferAutoLayout, redactFormValue, shouldSkipElement } from "../src/index.js";

describe("DOM Capture — Privacy & Redaction", () => {
  it("redacts password fields completely", () => {
    const input = {
      tagName: "INPUT",
      type: "password",
      name: "password",
      id: "pwd",
      placeholder: "Enter password",
    } as any;

    const redacted = redactFormValue(input, "Secret123!");
    expect(redacted).toBe("Enter password");
  });

  it("redacts sensitive fields like credit cards, auth tokens, and pins", () => {
    const input = {
      tagName: "INPUT",
      type: "text",
      name: "cardnumber",
      id: "card",
      placeholder: "",
    } as any;

    const redacted = redactFormValue(input, "4111 2222 3333 4444");
    expect(redacted).toBe("••••••••");
  });

  it("preserves non-input element text", () => {
    const div = { tagName: "DIV" } as any;
    expect(redactFormValue(div, "Card Heading")).toBe("Card Heading");
  });
});

describe("DOM Capture — Auto Layout Inference", () => {
  it('includes CSS borders in the content inset so full-width children can resize accurately',()=>{
    const layout=inferAutoLayout({display:'flex',flexDirection:'column',paddingLeft:'20px',paddingRight:'20px',borderLeftWidth:'1px',borderRightWidth:'1px'},2)!;
    expect(layout.paddingLeft).toBe(21);expect(layout.paddingRight).toBe(21);
  });
  it("infers horizontal Auto Layout for flex row with gap", () => {
    const computed = {
      display: "flex",
      flexDirection: "row",
      gap: "16px",
      paddingTop: "24px",
      paddingRight: "24px",
      paddingBottom: "24px",
      paddingLeft: "24px",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "nowrap",
    } as any;

    const autoLayout = inferAutoLayout(computed, 3);
    expect(autoLayout).toBeDefined();
    expect(autoLayout?.layoutMode).toBe("HORIZONTAL");
    expect(autoLayout?.itemSpacing).toBe(16);
    expect(autoLayout?.paddingTop).toBe(24);
    expect(autoLayout?.primaryAxisAlignItems).toBe("SPACE_BETWEEN");
    expect(autoLayout?.counterAxisAlignItems).toBe("CENTER");
  });

  it("infers vertical Auto Layout for flex column", () => {
    const computed = {
      display: "flex",
      flexDirection: "column",
      rowGap: "12px",
      justifyContent: "flex-start",
      alignItems: "stretch",
    } as any;

    const autoLayout = inferAutoLayout(computed, 2);
    expect(autoLayout).toBeDefined();
    expect(autoLayout?.layoutMode).toBe("VERTICAL");
    expect(autoLayout?.itemSpacing).toBe(12);
  });

  it("returns undefined for non-flex display or 0 children", () => {
    const computed = { display: "block" } as any;
    expect(inferAutoLayout(computed, 2)).toBeUndefined();

    const flexNoChildren = { display: "flex" } as any;
    expect(inferAutoLayout(flexNoChildren, 0)).toBeUndefined();
  });
});

describe("DOM Capture — Layer Naming & Filtering", () => {
  it("generates semantic layer names based on tags and roles", () => {
    const btn = {
      tagName: "BUTTON",
      id: "",
      classList: ["btn-primary"],
      getAttribute: () => null,
    } as any;
    expect(generateLayerName(btn)).toBe("Button .btn-primary");

    const h1 = {
      tagName: "H1",
      id: "main-title",
      classList: [],
      getAttribute: () => null,
    } as any;
    expect(generateLayerName(h1)).toBe("Heading 1");
  });

  it("skips scripts, styles, and extension overlay elements", () => {
    const script = { tagName: "SCRIPT" } as any;
    expect(shouldSkipElement(script, {} as any)).toBe(true);

    const overlay = {
      tagName: "DIV",
      id: "frameforge-overlay",
      getAttribute: () => "true",
    } as any;
    expect(shouldSkipElement(overlay, {} as any)).toBe(true);

    const hidden = { tagName: "DIV", classList: [] } as any;
    expect(shouldSkipElement(hidden, { display: "none" } as any)).toBe(true);
  });
});
