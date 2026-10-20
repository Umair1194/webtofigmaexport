export function fastStringHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class AssetRegistry {
  private assetsByHash = new Map<string, { id: string; dataUrl: string; mimeType: string }>();
  private hashByUrl = new Map<string, string>();

  public register(url: string, dataUrl: string, mimeType = "image/png"): string {
    const hash = fastStringHash(dataUrl);
    if (!this.assetsByHash.has(hash)) {
      const id = `asset-${hash}`;
      this.assetsByHash.set(hash, { id, dataUrl, mimeType });
    }
    this.hashByUrl.set(url, hash);
    return hash;
  }

  public getByUrl(url: string) {
    const hash = this.hashByUrl.get(url);
    return hash ? this.assetsByHash.get(hash) : undefined;
  }

  public getByHash(hash: string) {
    return this.assetsByHash.get(hash);
  }

  public getAll() {
    return Array.from(this.assetsByHash.values());
  }

  public size() {
    return this.assetsByHash.size;
  }
}
