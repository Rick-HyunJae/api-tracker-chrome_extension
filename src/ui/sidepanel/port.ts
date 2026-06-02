// The side panel page opens a port on load so the background SW can track which
// tab has the panel open (Chrome exposes no "is the panel open" query). The port
// disconnects automatically when the panel closes, letting the SW clear tracking.
export async function connectSidePanelPort(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = tabs[0]?.id
  if (typeof tabId !== 'number') return
  const port = chrome.runtime.connect({ name: 'sidepanel' })
  port.postMessage({ tabId })
}
