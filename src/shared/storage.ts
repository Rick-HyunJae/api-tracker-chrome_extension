import { DEFAULT_STORAGE } from './types'
import type { StorageSchema } from './types'

export async function getStorage(): Promise<StorageSchema> {
  const raw = (await chrome.storage.local.get(null)) as Partial<StorageSchema>
  return {
    settings: { ...DEFAULT_STORAGE.settings, ...(raw.settings ?? {}) },
    currentSession: raw.currentSession ?? DEFAULT_STORAGE.currentSession,
    sessions: raw.sessions ?? DEFAULT_STORAGE.sessions,
    mcpList: raw.mcpList ?? DEFAULT_STORAGE.mcpList,
  }
}

export async function patchStorage(patch: Partial<StorageSchema>): Promise<void> {
  await chrome.storage.local.set(patch)
}

export type StorageChangeHandler = (
  changes: Record<string, chrome.storage.StorageChange>,
) => void

export function onStorageChanged(handler: StorageChangeHandler): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    handler(changes)
  })
}

export async function grantConsent(): Promise<void> {
  const s = await getStorage()
  await patchStorage({ settings: { ...s.settings, consentGivenAt: Date.now() } })
}
