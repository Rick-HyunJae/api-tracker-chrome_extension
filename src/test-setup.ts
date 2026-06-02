import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

type Listener = (...args: unknown[]) => void

function makeEvent() {
  const listeners: Listener[] = []
  return {
    addListener: vi.fn((fn: Listener) => listeners.push(fn)),
    removeListener: vi.fn(),
    _emit: (...args: unknown[]) => listeners.forEach((l) => l(...args)),
    _listeners: listeners,
  }
}

;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    onChanged: makeEvent(),
  },
  runtime: {
    id: 'test',
    sendMessage: vi.fn(async () => undefined),
    onMessage: makeEvent(),
    onConnect: makeEvent(),
    connect: vi.fn(() => ({
      name: 'sidepanel',
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: makeEvent(),
      onDisconnect: makeEvent(),
    })),
    getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
    lastError: undefined,
  },
  tabs: {
    query: vi.fn(async () => []),
    sendMessage: vi.fn(async () => undefined),
    onUpdated: makeEvent(),
    onRemoved: makeEvent(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(async () => true),
    onAlarm: makeEvent(),
  },
  action: {
    setBadgeText: vi.fn(async () => undefined),
    setBadgeBackgroundColor: vi.fn(async () => undefined),
  },
  sidePanel: {
    open: vi.fn(async () => undefined),
    setOptions: vi.fn(async () => undefined),
    setPanelBehavior: vi.fn(async () => undefined),
  },
} as unknown as typeof chrome
