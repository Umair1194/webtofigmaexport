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
