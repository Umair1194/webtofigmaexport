export async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl?: string; error?: string }> {
  if (!url) return { error: "Empty URL" };

  if (url.startsWith("data:")) {
    return { dataUrl: url };
  }

  try {
    const res = await fetch(url, { credentials: "omit", mode: "cors" });
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({ dataUrl: reader.result as string });
      };
      reader.onerror = () => {
        resolve({ error: "Failed to read blob" });
      };
      reader.readAsDataURL(blob);
    });
  } catch (err: any) {
    return { error: err?.message || "CORS restricted" };
  }
}
