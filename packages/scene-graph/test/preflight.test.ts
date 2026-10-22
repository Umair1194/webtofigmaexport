import { describe, expect, it } from "vitest";
import { validateSceneGraph } from "../src/validator.js";
import { MAX_SCENE_NODES } from '../src/types.js';
const root = (overrides = {}) => ({ type: "FRAME", children: [], fills: [], ...overrides });
describe("Untrusted capture validation", () => {
  it('accepts bounded long-page scenes beyond the former 5000-node ceiling',()=>{
    expect(validateSceneGraph({root:root({children:Array.from({length:6000},()=>root())})}).valid).toBe(true);
  });
  it.each([
    root({ fills: [{ type: "SOLID", color: { r: 3, g: 0, b: 0, a: 1 } }] }),
    root({ effects: [{ type: "DROP_SHADOW", radius: -1 }] }),
    root({ autoLayout: { layoutMode: "EXPLODE" } }),
    root({ children: [{ type:"TEXT", characters:"text", style: { fontFamily:"Inter", fontSize:Infinity, fontWeight:400 } }] }),
    root({ cornerRadius: { topLeft: "NaN" } }),
  ])("rejects malformed nested Figma properties", value => { expect(validateSceneGraph({ root: value }).valid).toBe(false); });
  it("rejects overly wide and cyclic trees", () => {
    expect(validateSceneGraph({ root: root({ children: Array.from({length:MAX_SCENE_NODES+1}, () => root()) }) }).valid).toBe(false);
    const cycle: any = root(); cycle.children.push(cycle); expect(validateSceneGraph({ root:cycle }).valid).toBe(false);
  });
  it("rejects too-deep content instead of silently losing layers", () => {
    const deep: any = root(); let current = deep; for(let i=0;i<85;i++) { const child=root(); current.children.push(child); current=child; }
    expect(validateSceneGraph({root:deep}).errors.join()).toContain("budget");
  });
});
