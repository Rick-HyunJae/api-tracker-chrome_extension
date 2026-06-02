// Persist the floating widget's vertical position. We use a dedicated
// chrome.storage.local key (NOT the host page's localStorage, which a content
// script would otherwise pollute and which is origin-isolated per site).
const KEY = 'widgetDockTop'

export async function getDockTop(): Promise<number | null> {
  const r = await chrome.storage.local.get(KEY)
  const v = (r as Record<string, unknown>)[KEY]
  return typeof v === 'number' ? v : null
}

export async function setDockTop(top: number): Promise<void> {
  await chrome.storage.local.set({ [KEY]: top })
}
