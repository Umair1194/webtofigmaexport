import { describe, expect, it } from "vitest";
import { AssetRegistry, fastStringHash } from "../src/index.js";

describe("Asset Pipeline — Hashing & Registry", () => {
  it("produces deterministic 8-character hex hashes", () => {
    const hash1 = fastStringHash("https://example.com/logo.png");
    const hash2 = fastStringHash("https://example.com/logo.png");
    const hash3 = fastStringHash("https://example.com/other.png");

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8);
    expect(hash1).not.toBe(hash3);
  });

  it("registers and deduplicates image assets by content hash", () => {
    const registry = new AssetRegistry();
    const dataUrlA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const hashA = registry.register("https://example.com/icon-1.png", dataUrlA);
    const hashB = registry.register("https://example.com/icon-2.png", dataUrlA);

    expect(hashA).toBe(hashB);
    expect(registry.size()).toBe(1);
    expect(registry.getByUrl("https://example.com/icon-1.png")).toBeDefined();
    expect(registry.getByUrl("https://example.com/icon-2.png")).toBeDefined();
  });
});

import { vi } from "vitest";
import { fetchImageAsDataUrl } from "../src/encode.js";
describe("Bounded image downloads", () => {
  it("rejects data that is not an image without fetching", async () => {
    expect((await fetchImageAsDataUrl("data:text/html,test")).error).toContain("not an image");
  });
  it("rejects oversized content before reading its body", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("bad",{headers:{"content-type":"image/png","content-length":"1000"}})));
    expect((await fetchImageAsDataUrl("https://example.com/a",{maxBytes:10})).error).toContain("size limit");vi.unstubAllGlobals();
  });
  it("bounds streaming bodies without trusting content-length", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(new Uint8Array(20),{headers:{"content-type":"image/png"}})));
    expect((await fetchImageAsDataUrl("https://example.com/a",{maxBytes:10})).error).toContain("size limit");vi.unstubAllGlobals();
  });
});

it('encodes streamed image bytes without FileReader, including service-worker environments',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})));vi.stubGlobal('FileReader',undefined);
 expect(await fetchImageAsDataUrl('https://cdn.example/a.png')).toEqual({dataUrl:'data:image/png;base64,AQID'});
 expect(fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({credentials:'omit'}));vi.unstubAllGlobals();
});
it('recognizes an octet-stream PNG but rejects an HTML response masquerading as an image URL',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'content-type':'application/octet-stream'}})).mockResolvedValueOnce(new Response('<html>login</html>',{headers:{'content-type':'application/octet-stream'}}));vi.stubGlobal('fetch',fetchMock);
 expect((await fetchImageAsDataUrl('https://cdn.example/a')).dataUrl).toContain('data:image/png;base64,');expect((await fetchImageAsDataUrl('https://cdn.example/b.png')).error).toContain('not a recognized image');vi.unstubAllGlobals();
});
