/** Best-effort notifications also tolerate a synchronously invalidated extension context. */
export async function notifyRuntime(message: unknown): Promise<void> {
  try { await chrome.runtime.sendMessage(message); } catch { /* Page refresh reconnects a reloaded extension. */ }
}
