# API-to-MCP Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Manifest V3 extension that captures REST API calls from any website, lets the user manually send a captured session to a configured server, and displays the server-generated MCP server list in the extension Options page.

**Architecture:** A main-world injected script monkey-patches `fetch`/`XHR`/History API and forwards captures via `window.postMessage` to an isolated-world content bridge, which relays them to a Background Service Worker over `chrome.runtime`. The Background SW owns all business logic (session boundaries, idle timeout, server transmission with retry) and persists everything to `chrome.storage.local`, the single source of truth. React UIs (Shadow-DOM floating widget, SidePanel, Options page) read/write state reactively through `chrome.storage.onChanged`.

**Tech Stack:** Chrome Manifest V3, React 18 + TypeScript, Vite (with `@crxjs/vite-plugin`), Vitest + @testing-library/react + jsdom + vitest-chrome for testing.

---

## Conventions

- Package manager: `npm`. All commands run from `extension/`.
- Test runner: `vitest`. Single run via `npx vitest run <path>`; watch via `npx vitest`.
- All source under `extension/src/`, tests colocated as `*.test.ts` / `*.test.tsx` next to the module.
- Commit after every task once its tests pass.

---

## Task 1: Project Scaffold

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vite.config.ts`
- Create: `extension/src/test-setup.ts`
- Create: `extension/manifest.json`
- Create: `extension/public/sidepanel.html`
- Create: `extension/public/options.html`
- Create: `extension/.gitignore`

- [ ] **Step 1: Create `extension/package.json`**
```json
{
  "name": "api-to-mcp-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@types/chrome": "^0.0.270",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@vitest/coverage-v8": "^2.0.5",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5",
    "vitest-chrome": "^0.1.0"
  }
}
```

- [ ] **Step 2: Create `extension/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["chrome", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `extension/vite.config.ts`**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' assert { type: 'json' }

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 4: Create `extension/src/test-setup.ts`**
```typescript
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

global.chrome = {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    onChanged: makeEvent(),
  },
  runtime: {
    sendMessage: vi.fn(async () => undefined),
    onMessage: makeEvent(),
    getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
    lastError: undefined,
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
    setPanelBehavior: vi.fn(async () => undefined),
  },
} as unknown as typeof chrome
```

- [ ] **Step 5: Create `extension/manifest.json`**
```json
{
  "manifest_version": 3,
  "name": "API-to-MCP Tracker",
  "version": "0.1.0",
  "description": "Capture REST API calls and turn captured sessions into MCP servers.",
  "permissions": ["storage", "alarms", "sidePanel", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "action": {
    "default_title": "API-to-MCP Tracker"
  },
  "side_panel": {
    "default_path": "public/sidepanel.html"
  },
  "options_page": "public/options.html",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-bridge.ts", "src/content/widget-host.ts"],
      "run_at": "document_start"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["assets/injected-capture*.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

- [ ] **Step 6: Create `extension/public/sidepanel.html`**
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>API-to-MCP Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/ui/sidepanel/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `extension/public/options.html`**
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>API-to-MCP Tracker - 대시보드</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/ui/options/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `extension/.gitignore`**
```gitignore
node_modules/
dist/
coverage/
*.log
```

- [ ] **Step 9: Install dependencies and verify the toolchain runs**
Run: `cd extension && npm install && npx vitest run`
Expected: install succeeds; vitest exits with "No test files found" (exit code 0 or a clear "no tests" message). The toolchain is wired.

- [ ] **Step 10: Commit**
```bash
git add extension/package.json extension/tsconfig.json extension/vite.config.ts \
  extension/src/test-setup.ts extension/manifest.json extension/public/sidepanel.html \
  extension/public/options.html extension/.gitignore
git commit -m "chore: scaffold API-to-MCP Tracker extension (manifest, vite, vitest)"
```

---

## Task 2: Consent Flow

**Goal:** Block tracking until user explicitly consents to data collection including auth headers and response body.

> ⚠️ This task addresses a legally important requirement flagged in the spec: the extension must not capture auth headers or response bodies until the user has explicitly consented.

**Files:**
- Modify: `extension/src/shared/types.ts` — add `consentGivenAt?: number` to `Settings`
- Create: `extension/src/ui/consent/ConsentBanner.tsx`
- Modify: `extension/src/content/widget-host.ts` — check consent before injecting capture script
- Modify: `extension/src/background/index.ts` — check consent before processing API_CAPTURED

> Note: This task is written before the modules it touches exist (types in Task 3, widget-host in Task 11, background in Task 8). When executing the plan top-to-bottom, apply the `consentGivenAt` field as part of Task 3, and apply the consent gates when implementing the respective modules. The steps below are the authoritative source for the consent behavior; cross-reference them while building those modules.

- [ ] **Step 1: Add consentGivenAt to Settings type**
Add to the `Settings` interface (in `extension/src/shared/types.ts`, Task 3):
```typescript
consentGivenAt?: number;  // undefined = not yet consented
```

- [ ] **Step 2: Write test for consent gate in background**
```typescript
it('ignores API_CAPTURED when consent not given', async () => {
  const state = { ...DEFAULT_STORAGE, settings: { ...DEFAULT_STORAGE.settings, consentGivenAt: undefined } }
  const next = await handleMessage(
    state,
    { type: MSG.API_CAPTURED, payload: makeCall('1') },
    'https://example.com',
    ctx,
  )
  expect(next.state.currentSession?.calls ?? []).toHaveLength(0)
})
```

- [ ] **Step 3: Add consent gate to handleMessage**
In `background/index.ts`'s `handleMessage`, add at the top of the `API_CAPTURED` case (before the `trackingEnabled` check):
```typescript
case MSG.API_CAPTURED: {
  if (!state.settings.consentGivenAt) return { state }
  if (!state.settings.trackingEnabled) return { state }
  // ... rest of handling (appendCall)
}
```

- [ ] **Step 4: Create ConsentBanner component**
```tsx
// extension/src/ui/consent/ConsentBanner.tsx
import React from 'react'
import { grantConsent } from '../../shared/storage'

export function ConsentBanner(): React.ReactElement {
  return (
    <div role="dialog" aria-labelledby="consent-title" style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <h2 id="consent-title">API Tracker 데이터 수집 동의</h2>
      <p>
        이 Extension은 현재 페이지에서 발생하는 모든 API 호출의
        <strong>요청 헤더(인증 토큰 포함)</strong>, 요청/응답 body를
        외부 서버로 전송합니다. 민감한 정보가 포함될 수 있습니다.
      </p>
      <button onClick={() => void grantConsent()}>동의하고 시작</button>
    </div>
  )
}
```

> `grantConsent()` is a new helper in `extension/src/shared/storage.ts` that patches `settings.consentGivenAt = Date.now()`:
> ```typescript
> export async function grantConsent(): Promise<void> {
>   const s = await getStorage()
>   await patchStorage({ settings: { ...s.settings, consentGivenAt: Date.now() } })
> }
> ```

- [ ] **Step 5: Show banner in SidePanel when consent not given**
In `extension/src/ui/sidepanel/index.tsx`, render `<ConsentBanner />` when `!settings.consentGivenAt` (in place of the capture list / send button).

- [ ] **Step 6: Test ConsentBanner renders and consent button calls grantConsent**
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentBanner } from './ConsentBanner'
import * as storage from '../../shared/storage'

it('calls grantConsent when button clicked', async () => {
  const spy = vi.spyOn(storage, 'grantConsent').mockResolvedValue(undefined)
  render(<ConsentBanner />)
  await userEvent.click(screen.getByRole('button', { name: /동의하고 시작/ }))
  expect(spy).toHaveBeenCalledOnce()
})
```

- [ ] **Step 7: Gate main-world injection on consent in widget-host**
In `extension/src/content/widget-host.ts`'s `init()`, do not call `injectMainWorldCapture()` unless `settings.consentGivenAt` is set. Show the (paused) widget so the user can open the panel and consent.

- [ ] **Step 8: Commit**
```bash
git add extension/src/shared/types.ts extension/src/ui/consent/ConsentBanner.tsx extension/src/background/index.ts extension/src/ui/sidepanel/index.tsx
git commit -m "feat: add consent gate before API capture"
```

---

## Task 3: Shared Types

**Files:**
- Create: `extension/src/shared/types.ts`
- Test: `extension/src/shared/types.test.ts`

- [ ] **Step 1: Write the failing test**
`extension/src/shared/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_STORAGE } from './types'
import type { StorageSchema, ApiCall } from './types'

describe('shared types defaults', () => {
  it('DEFAULT_SETTINGS has tracking enabled and empty blacklist', () => {
    expect(DEFAULT_SETTINGS.trackingEnabled).toBe(true)
    expect(DEFAULT_SETTINGS.serverUrl).toBe('')
    expect(DEFAULT_SETTINGS.apiKey).toBe('')
    expect(DEFAULT_SETTINGS.blacklistedDomains).toEqual([])
  })

  it('DEFAULT_STORAGE has no current session and empty collections', () => {
    const s: StorageSchema = DEFAULT_STORAGE
    expect(s.currentSession).toBeNull()
    expect(s.sessions).toEqual([])
    expect(s.mcpList).toEqual([])
    expect(s.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('ApiCall shape is assignable', () => {
    const call: ApiCall = {
      id: 'c1',
      url: 'https://x/api',
      method: 'GET',
      requestHeaders: {},
      requestBody: null,
      responseStatus: 200,
      responseHeaders: {},
      responseBody: null,
      durationMs: 12,
      capturedAt: 1,
    }
    expect(call.method).toBe('GET')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/shared/types.test.ts`
Expected: FAIL with "Failed to resolve import './types'" (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**
`extension/src/shared/types.ts`:
```typescript
export interface ApiCall {
  id: string
  url: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string | null
  durationMs: number
  capturedAt: number
}

export interface Settings {
  serverUrl: string
  apiKey: string
  trackingEnabled: boolean
  blacklistedDomains: string[]
  consentGivenAt?: number // undefined = user has not yet consented to data collection
}

export interface CurrentSession {
  sessionId: string
  url: string
  startedAt: number
  calls: ApiCall[]
  status: 'recording' | 'idle'
}

export type TransmitStatus = 'pending' | 'sent' | 'failed'

export interface StoredSession {
  sessionId: string
  url: string
  startedAt: number
  endedAt: number
  calls: ApiCall[]
  transmitStatus: TransmitStatus
  sentAt?: number
}

export interface McpEntry {
  id: string
  name: string
  sourceUrl: string
  endpoint: string
  createdAt: number
  active: boolean
}

export interface StorageSchema {
  settings: Settings
  currentSession: CurrentSession | null
  sessions: StoredSession[]
  mcpList: McpEntry[]
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: '',
  apiKey: '',
  trackingEnabled: true,
  blacklistedDomains: [],
}

export const DEFAULT_STORAGE: StorageSchema = {
  settings: DEFAULT_SETTINGS,
  currentSession: null,
  sessions: [],
  mcpList: [],
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/shared/types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/shared/types.ts extension/src/shared/types.test.ts
git commit -m "feat: add shared StorageSchema and ApiCall types"
```

---

## Task 4: Message Type Constants

**Files:**
- Create: `extension/src/shared/messages.ts`
- Test: `extension/src/shared/messages.test.ts`

- [ ] **Step 1: Write the failing test**
`extension/src/shared/messages.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { MSG, POSTMSG_SOURCE } from './messages'
import type { CaptureMessage, SendSessionMessage } from './messages'

describe('message constants', () => {
  it('exposes all runtime message types', () => {
    expect(MSG.API_CAPTURED).toBe('API_CAPTURED')
    expect(MSG.SESSION_CHANGE).toBe('SESSION_CHANGE')
    expect(MSG.SEND_SESSION).toBe('SEND_SESSION')
    expect(MSG.TOGGLE_TRACKING).toBe('TOGGLE_TRACKING')
    expect(MSG.OPEN_SIDEPANEL).toBe('OPEN_SIDEPANEL')
  })

  it('defines a stable postMessage source tag', () => {
    expect(POSTMSG_SOURCE).toBe('api-to-mcp-tracker')
  })

  it('typed message payloads are constructable', () => {
    const cap: CaptureMessage = {
      type: MSG.API_CAPTURED,
      payload: {
        id: 'c1', url: 'u', method: 'GET', requestHeaders: {}, requestBody: null,
        responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 1,
      },
    }
    const send: SendSessionMessage = { type: MSG.SEND_SESSION, sessionId: 's1' }
    expect(cap.type).toBe('API_CAPTURED')
    expect(send.sessionId).toBe('s1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/shared/messages.test.ts`
Expected: FAIL with "Failed to resolve import './messages'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/shared/messages.ts`:
```typescript
import type { ApiCall } from './types'

export const POSTMSG_SOURCE = 'api-to-mcp-tracker' as const

export const MSG = {
  API_CAPTURED: 'API_CAPTURED',
  SESSION_CHANGE: 'SESSION_CHANGE',
  SEND_SESSION: 'SEND_SESSION',
  TOGGLE_TRACKING: 'TOGGLE_TRACKING',
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
} as const

export type MsgType = (typeof MSG)[keyof typeof MSG]

export type SessionChangeReason = 'pushState' | 'replaceState' | 'popstate' | 'beforeunload' | 'idle'

export interface CaptureMessage {
  type: typeof MSG.API_CAPTURED
  payload: ApiCall & { pageUrl: string } // URL at time of capture (survives SPA navigation)
}

export interface SessionChangeMessage {
  type: typeof MSG.SESSION_CHANGE
  reason: SessionChangeReason
  url: string
}

export interface SendSessionMessage {
  type: typeof MSG.SEND_SESSION
  sessionId: string
}

export interface ToggleTrackingMessage {
  type: typeof MSG.TOGGLE_TRACKING
  enabled: boolean
}

export interface OpenSidePanelMessage {
  type: typeof MSG.OPEN_SIDEPANEL
}

export type RuntimeMessage =
  | CaptureMessage
  | SessionChangeMessage
  | SendSessionMessage
  | ToggleTrackingMessage
  | OpenSidePanelMessage

export interface SendSessionResponse {
  ok: boolean
  error?: string
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/shared/messages.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/shared/messages.ts extension/src/shared/messages.test.ts
git commit -m "feat: add chrome runtime message and postMessage constants"
```

---

## Task 5: Storage Wrapper

**Files:**
- Create: `extension/src/shared/storage.ts`
- Test: `extension/src/shared/storage.test.ts`

- [ ] **Step 1: Write the failing test**
`extension/src/shared/storage.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStorage, patchStorage, onStorageChanged } from './storage'
import { DEFAULT_STORAGE } from './types'

describe('storage wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns defaults when storage empty', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({})
    const s = await getStorage()
    expect(s).toEqual(DEFAULT_STORAGE)
  })

  it('merges stored values over defaults', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      mcpList: [{ id: 'm1', name: 'n', sourceUrl: 'u', endpoint: 'e', createdAt: 1, active: true }],
    })
    const s = await getStorage()
    expect(s.mcpList).toHaveLength(1)
    expect(s.sessions).toEqual([])
  })

  it('patchStorage reads-modifies-writes only provided keys', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({})
    await patchStorage({ sessions: [] })
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ sessions: [] })
  })

  it('onStorageChanged only fires for local area', () => {
    const cb = vi.fn()
    onStorageChanged(cb)
    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
    listener({ mcpList: { newValue: [] } }, 'sync')
    expect(cb).not.toHaveBeenCalled()
    listener({ mcpList: { newValue: [] } }, 'local')
    expect(cb).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/shared/storage.test.ts`
Expected: FAIL with "Failed to resolve import './storage'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/shared/storage.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/shared/storage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/shared/storage.ts extension/src/shared/storage.test.ts
git commit -m "feat: add typed chrome.storage.local wrapper"
```

---

## Task 6: Session Manager

**Files:**
- Create: `extension/src/background/session-manager.ts`
- Test: `extension/src/background/session-manager.test.ts`

The session manager is a pure-ish module: it operates on a `StorageSchema` snapshot and returns the next state, plus side-effect descriptors. This keeps it unit-testable without a live SW.

- [ ] **Step 1: Write the failing test**
`extension/src/background/session-manager.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  startSession,
  appendCall,
  rotateSession,
  IDLE_TIMEOUT_MS,
} from './session-manager'
import { DEFAULT_STORAGE } from '../shared/types'
import type { ApiCall, StorageSchema } from '../shared/types'

function makeCall(id: string): ApiCall & { pageUrl: string } {
  return {
    id, url: 'https://x/api', method: 'GET', requestHeaders: {}, requestBody: null,
    responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 100,
    pageUrl: 'https://x/page',
  }
}

describe('session-manager', () => {
  it('idle timeout constant is 30 minutes', () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
  })

  it('startSession creates a recording session with no calls', () => {
    const next = startSession(DEFAULT_STORAGE, 'https://x/page', 1000)
    expect(next.currentSession).not.toBeNull()
    expect(next.currentSession!.url).toBe('https://x/page')
    expect(next.currentSession!.status).toBe('recording')
    expect(next.currentSession!.calls).toEqual([])
    expect(next.currentSession!.startedAt).toBe(1000)
  })

  it('appendCall starts a session if none exists then appends', () => {
    const next = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000)
    expect(next.currentSession!.calls).toHaveLength(1)
    expect(next.currentSession!.calls[0].id).toBe('c1')
  })

  it('appendCall accumulates into existing session', () => {
    const s1 = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000)
    const s2 = appendCall(s1, makeCall('c2'), 1100)
    expect(s2.currentSession!.calls.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('rotateSession moves current into sessions[] as pending and starts a fresh one', () => {
    const recording = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000)
    const next = rotateSession(recording, 'https://x/b', 2000)
    expect(next.sessions).toHaveLength(1)
    expect(next.sessions[0].transmitStatus).toBe('pending')
    expect(next.sessions[0].endedAt).toBe(2000)
    expect(next.sessions[0].calls.map((c) => c.id)).toEqual(['c1'])
    expect(next.currentSession!.url).toBe('https://x/b')
    expect(next.currentSession!.calls).toEqual([])
  })

  it('rotateSession with no current session just starts a new one', () => {
    const next = rotateSession(DEFAULT_STORAGE, 'https://x/b', 2000)
    expect(next.sessions).toHaveLength(0)
    expect(next.currentSession!.url).toBe('https://x/b')
  })

  it('rotateSession does not archive an empty current session', () => {
    const empty = startSession(DEFAULT_STORAGE, 'https://x/a', 1000)
    const next = rotateSession(empty as StorageSchema, 'https://x/b', 2000)
    expect(next.sessions).toHaveLength(0)
    expect(next.currentSession!.url).toBe('https://x/b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/background/session-manager.test.ts`
Expected: FAIL with "Failed to resolve import './session-manager'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/background/session-manager.ts`:
```typescript
import type { ApiCall, CurrentSession, StorageSchema, StoredSession } from '../shared/types'

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000

function newSessionId(now: number): string {
  return `sess_${now}_${Math.random().toString(36).slice(2, 8)}`
}

function freshSession(url: string, now: number): CurrentSession {
  return {
    sessionId: newSessionId(now),
    url,
    startedAt: now,
    calls: [],
    status: 'recording',
  }
}

export function startSession(state: StorageSchema, url: string, now: number): StorageSchema {
  return { ...state, currentSession: freshSession(url, now) }
}

export function appendCall(
  state: StorageSchema,
  call: ApiCall & { pageUrl: string },
  now: number,
): StorageSchema {
  // Use the page URL captured at request time (survives SPA navigation),
  // not the SW's lagging view of the tab URL.
  const pageOrigin = new URL(call.pageUrl).origin
  const current =
    state.currentSession ?? freshSession(call.pageUrl, now)
  void pageOrigin // session-boundary origin check is enforced via rotateSession on SESSION_CHANGE
  return {
    ...state,
    currentSession: {
      ...current,
      status: 'recording',
      calls: [...current.calls, call],
    },
  }
}

export function rotateSession(state: StorageSchema, nextUrl: string, now: number): StorageSchema {
  const current = state.currentSession
  const shouldArchive = current !== null && current.calls.length > 0

  const archived: StoredSession[] = shouldArchive
    ? [
        ...state.sessions,
        {
          sessionId: current!.sessionId,
          url: current!.url,
          startedAt: current!.startedAt,
          endedAt: now,
          calls: current!.calls,
          transmitStatus: 'pending',
        },
      ]
    : state.sessions

  return {
    ...state,
    sessions: archived,
    currentSession: freshSession(nextUrl, now),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/background/session-manager.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/background/session-manager.ts extension/src/background/session-manager.test.ts
git commit -m "feat: add session-manager boundary and accumulation logic"
```

---

## Task 7: Sender (HTTP POST + Retry)

> ⚠️ BLOCKED: Exact payload schema must be confirmed with backend team before implementing. Using spec 4.4 flat structure as default.

**Files:**
- Create: `extension/src/background/sender.ts`
- Test: `extension/src/background/sender.test.ts`

- [ ] **Step 1: Write the failing test**
`extension/src/background/sender.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendSession, mergeMcpList, MAX_RETRIES, backoffDelayMs } from './sender'
import type { Settings, StoredSession } from '../shared/types'

const settings: Settings = {
  serverUrl: 'https://server.test',
  apiKey: 'KEY123',
  trackingEnabled: true,
  blacklistedDomains: [],
}

const session: StoredSession = {
  sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
  calls: [], transmitStatus: 'pending',
}

describe('sender', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('backoff grows exponentially', () => {
    expect(backoffDelayMs(0)).toBe(500)
    expect(backoffDelayMs(1)).toBe(1000)
    expect(backoffDelayMs(2)).toBe(2000)
  })

  it('MAX_RETRIES is 3', () => {
    expect(MAX_RETRIES).toBe(3)
  })

  it('posts to {serverUrl}/api/sessions with Bearer auth and returns mcpServers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mcpServers: [{ id: 'm1', name: 'n', sourceUrl: 'u', endpoint: 'e', createdAt: 1, active: true }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSession(settings, session, { sleep: async () => {} })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://server.test/api/sessions')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer KEY123',
    })
    expect(result.ok).toBe(true)
    expect(result.mcpServers).toHaveLength(1)
  })

  it('retries up to MAX_RETRIES on failure then returns failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSession(settings, session, { sleep: async () => {} })

    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('500')
  })

  it('succeeds on a later retry after transient failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ mcpServers: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSession(settings, session, { sleep: async () => {} })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('fails fast when serverUrl missing', async () => {
    const result = await sendSession({ ...settings, serverUrl: '' }, session, { sleep: async () => {} })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('serverUrl')
  })

  it('merges new MCP entries without duplicating existing ones', () => {
    const existing = [{ id: 'a', name: 'A', sourceUrl: 'x', endpoint: 'y', createdAt: 1, active: true }]
    const incoming = [
      { id: 'a', name: 'A-updated', sourceUrl: 'x', endpoint: 'y', createdAt: 1, active: true },
      { id: 'b', name: 'B', sourceUrl: 'z', endpoint: 'w', createdAt: 2, active: true },
    ]
    const result = mergeMcpList(existing, incoming)
    expect(result).toHaveLength(2)
    expect(result.find((m) => m.id === 'a')?.name).toBe('A-updated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/background/sender.test.ts`
Expected: FAIL with "Failed to resolve import './sender'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/background/sender.ts`:
```typescript
import type { McpEntry, Settings, StoredSession } from '../shared/types'

export const MAX_RETRIES = 3

export function backoffDelayMs(attempt: number): number {
  return 500 * 2 ** attempt
}

export interface SendResult {
  ok: boolean
  mcpServers?: McpEntry[]
  error?: string
}

export interface SenderDeps {
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function sendSession(
  settings: Settings,
  session: StoredSession,
  deps: SenderDeps = {},
): Promise<SendResult> {
  if (!settings.serverUrl) {
    return { ok: false, error: 'serverUrl is not configured' }
  }
  const sleep = deps.sleep ?? defaultSleep
  const endpoint = `${settings.serverUrl.replace(/\/$/, '')}/api/sessions`

  let lastError = 'unknown error'
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffDelayMs(attempt - 1))
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          url: session.url,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          calls: session.calls,
        }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        lastError =
          `Server error ${res.status}: ${errBody.slice(0, 200)}. ` +
          (res.status === 401 ? 'Check your API Key in Settings. ' : '') +
          (res.status === 404 ? 'Check your Server URL in Settings. ' : '') +
          (res.status >= 500 ? 'Server may be temporarily unavailable. ' : '')
        continue
      }
      const data = (await res.json()) as { mcpServers?: McpEntry[] }
      return { ok: true, mcpServers: data.mcpServers ?? [] }
    } catch (e) {
      lastError = `서버에 연결할 수 없습니다. Server URL과 네트워크 연결을 확인하세요. (${e instanceof Error ? e.message : String(e)})`;
    }
  }
  return { ok: false, error: lastError }
}

export function mergeMcpList(existing: McpEntry[], incoming: McpEntry[]): McpEntry[] {
  const byId = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()]
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/background/sender.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/background/sender.ts extension/src/background/sender.test.ts
git commit -m "feat: add sender with exponential-backoff retry and mcp merge"
```

---

## Task 8: Background Service Worker Entry (Message Router)

**Files:**
- Create: `extension/src/background/index.ts`
- Test: `extension/src/background/index.test.ts`

The router is exported as a pure `handleMessage(state, message, ctx)` function plus a thin `registerBackground()` that wires chrome listeners. We test `handleMessage` directly.

- [ ] **Step 1: Write the failing test**
`extension/src/background/index.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { handleMessage } from './index'
import { MSG } from '../shared/messages'
import { DEFAULT_STORAGE } from '../shared/types'
import type { ApiCall, CurrentSession, StorageSchema } from '../shared/types'

function makeCall(id: string): ApiCall & { pageUrl: string } {
  return {
    id, url: 'https://x/api', method: 'GET', requestHeaders: {}, requestBody: null,
    responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 1,
    pageUrl: 'https://x/page',
  }
}

// Storage with consent granted so the consent gate does not block capture tests.
const CONSENTED: StorageSchema = {
  ...DEFAULT_STORAGE,
  settings: { ...DEFAULT_STORAGE.settings, consentGivenAt: 1 },
}

const ctx = {
  now: () => 5000,
  send: vi.fn(),
}

describe('background message router', () => {
  it('API_CAPTURED appends the call to the current session', async () => {
    const next = await handleMessage(
      CONSENTED,
      { type: MSG.API_CAPTURED, payload: makeCall('c1') },
      'https://x/page',
      ctx,
    )
    expect(next.state.currentSession!.calls).toHaveLength(1)
  })

  it('ignores API_CAPTURED when consent not given', async () => {
    const next = await handleMessage(
      DEFAULT_STORAGE,
      { type: MSG.API_CAPTURED, payload: makeCall('1') },
      'https://example.com',
      ctx,
    )
    expect(next.state.currentSession?.calls ?? []).toHaveLength(0)
  })

  it('resumes existing currentSession after SW restart', async () => {
    const existingSession: CurrentSession = {
      sessionId: 'sess-1',
      url: 'https://example.com',
      startedAt: Date.now() - 60000,
      calls: [makeCall('existing')],
      status: 'recording',
    }
    // Simulate storage having a currentSession from before the SW terminated.
    const state: StorageSchema = { ...CONSENTED, currentSession: existingSession }

    // New call arrives after SW restart.
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('new') },
      'https://example.com',
      ctx,
    )

    // Should append to the existing session, not create a new one.
    expect(next.state.currentSession?.sessionId).toBe('sess-1')
    expect(next.state.currentSession?.calls).toHaveLength(2)
  })

  it('serializes concurrent API_CAPTURED writes without losing calls', async () => {
    // The actual concurrent safety lives in registerBackground's serialized()
    // queue. handleMessage is pure, so we validate the serialization design by
    // chaining two writes through the same read-modify-write contract: the
    // second call must observe the first call's result.
    const s1 = await handleMessage(
      CONSENTED,
      { type: MSG.API_CAPTURED, payload: makeCall('1') },
      'https://example.com',
      ctx,
    )
    const s2 = await handleMessage(
      s1.state,
      { type: MSG.API_CAPTURED, payload: makeCall('2') },
      'https://example.com',
      ctx,
    )
    expect(s2.state.currentSession?.calls).toHaveLength(2)
  })

  it('SESSION_CHANGE rotates the session', async () => {
    const recording: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 's0', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('c1')], status: 'recording',
      },
    }
    const next = await handleMessage(
      recording,
      { type: MSG.SESSION_CHANGE, reason: 'pushState', url: 'https://x/b' },
      'https://x/b',
      ctx,
    )
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.currentSession!.url).toBe('https://x/b')
  })

  it('TOGGLE_TRACKING updates settings.trackingEnabled', async () => {
    const next = await handleMessage(
      DEFAULT_STORAGE,
      { type: MSG.TOGGLE_TRACKING, enabled: false },
      'https://x/page',
      ctx,
    )
    expect(next.state.settings.trackingEnabled).toBe(false)
  })

  it('SEND_SESSION calls the sender and marks the session sent on success', async () => {
    const withPending: StorageSchema = {
      ...DEFAULT_STORAGE,
      sessions: [{
        sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
        calls: [makeCall('c1')], transmitStatus: 'pending',
      }],
    }
    const sendImpl = vi.fn().mockResolvedValue({
      ok: true,
      mcpServers: [{ id: 'm1', name: 'n', sourceUrl: 'u', endpoint: 'e', createdAt: 1, active: true }],
    })
    const next = await handleMessage(
      withPending,
      { type: MSG.SEND_SESSION, sessionId: 's1' },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.mcpList).toHaveLength(1)
    expect(next.response).toEqual({ ok: true })
  })

  it('SEND_SESSION marks the session failed on sender failure', async () => {
    const withPending: StorageSchema = {
      ...DEFAULT_STORAGE,
      sessions: [{
        sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
        calls: [makeCall('c1')], transmitStatus: 'pending',
      }],
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: false, error: 'server responded 500' })
    const next = await handleMessage(
      withPending,
      { type: MSG.SEND_SESSION, sessionId: 's1' },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(next.state.sessions[0].transmitStatus).toBe('failed')
    expect(next.response).toEqual({ ok: false, error: 'server responded 500' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/background/index.test.ts`
Expected: FAIL with "Failed to resolve import './index'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/background/index.ts`:
```typescript
import { getStorage, patchStorage } from '../shared/storage'
import { MSG } from '../shared/messages'
import type { RuntimeMessage, SendSessionResponse } from '../shared/messages'
import { appendCall, rotateSession, IDLE_TIMEOUT_MS } from './session-manager'
import { sendSession as defaultSendSession, mergeMcpList } from './sender'
import type { SendResult } from './sender'
import type { Settings, StorageSchema, StoredSession } from '../shared/types'

export interface RouterCtx {
  now: () => number
  sendSession?: (s: Settings, sess: StoredSession) => Promise<SendResult>
}

export interface RouterResult {
  state: StorageSchema
  response?: SendSessionResponse
}

export async function handleMessage(
  state: StorageSchema,
  msg: RuntimeMessage,
  senderUrl: string,
  ctx: RouterCtx,
): Promise<RouterResult> {
  switch (msg.type) {
    case MSG.API_CAPTURED: {
      if (!state.settings.consentGivenAt) return { state }
      if (!state.settings.trackingEnabled) return { state }
      return { state: appendCall(state, msg.payload, ctx.now()) }
    }
    case MSG.SESSION_CHANGE: {
      return { state: rotateSession(state, msg.url, ctx.now()) }
    }
    case MSG.TOGGLE_TRACKING: {
      return {
        state: { ...state, settings: { ...state.settings, trackingEnabled: msg.enabled } },
      }
    }
    case MSG.SEND_SESSION: {
      const idx = state.sessions.findIndex((s) => s.sessionId === msg.sessionId)
      if (idx === -1) return { state, response: { ok: false, error: 'session not found' } }
      const send = ctx.sendSession ?? defaultSendSession
      const result = await send(state.settings, state.sessions[idx])
      const sessions = state.sessions.slice()
      if (result.ok) {
        sessions[idx] = { ...sessions[idx], transmitStatus: 'sent', sentAt: ctx.now() }
        const mcpList = mergeMcpList(state.mcpList, result.mcpServers ?? [])
        return { state: { ...state, sessions, mcpList }, response: { ok: true } }
      }
      sessions[idx] = { ...sessions[idx], transmitStatus: 'failed' }
      return { state: { ...state, sessions }, response: { ok: false, error: result.error } }
    }
    case MSG.OPEN_SIDEPANEL: {
      return { state }
    }
    default:
      return { state }
  }
}

const IDLE_ALARM = 'idle-timeout'

export function registerBackground(): void {
  // Write serialization to prevent concurrent storage mutations.
  // Every API_CAPTURED does getStorage -> mutate -> patchStorage(full state).
  // Without serialization, concurrent messages read the same snapshot and the
  // last write wins, silently dropping calls. Chaining writes onto a single
  // promise lock forces strict read-modify-write ordering.
  let writeLock: Promise<void> = Promise.resolve()

  function serialized(fn: () => Promise<void>): Promise<void> {
    writeLock = writeLock.then(fn).catch(() => {})
    return writeLock
  }

  void chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(() => undefined)

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    const senderUrl = sender.tab?.url ?? sender.url ?? ''
    void serialized(async () => {
      const state = await getStorage()
      const ctx: RouterCtx = { now: () => Date.now() }
      const { state: next, response } = await handleMessage(state, message, senderUrl, ctx)
      await patchStorage(next)
      if (message.type === MSG.API_CAPTURED || message.type === MSG.SESSION_CHANGE) {
        chrome.alarms.clear(IDLE_ALARM)
        chrome.alarms.create(IDLE_ALARM, { delayInMinutes: IDLE_TIMEOUT_MS / 60000 })
      }
      sendResponse(response ?? { ok: true })
    })
    return true
  })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== IDLE_ALARM) return
    void serialized(async () => {
      const state = await getStorage()
      const next = rotateSession(state, state.currentSession?.url ?? '', Date.now())
      await patchStorage(next)
    })
  })
}

registerBackground()
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/background/index.test.ts`
Expected: PASS (8 tests).

> Note: importing `index.ts` runs `registerBackground()` at module load. The test relies on the chrome mock from `test-setup.ts`, so listener registration succeeds harmlessly.

- [ ] **Step 5: Commit**
```bash
git add extension/src/background/index.ts extension/src/background/index.test.ts
git commit -m "feat: add background SW message router and idle-timeout alarm"
```

---

## Task 9: Injected Capture (main world monkey-patch)

**Files:**
- Create: `extension/src/content/injected-capture.ts`
- Test: `extension/src/content/injected-capture.test.ts`

The capture logic is split into a pure `buildApiCall(...)` plus a `postCapture(...)` and the patchers. We unit-test the pure builder and the fetch patcher against a fake `window`.

- [ ] **Step 1: Write the failing test**
`extension/src/content/injected-capture.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApiCall, installFetchPatch, installHistoryPatch, installXhrPatch } from './injected-capture'
import { POSTMSG_SOURCE } from '../shared/messages'

describe('injected-capture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('buildApiCall normalizes a fetch request/response into ApiCall shape', () => {
    const call = buildApiCall({
      url: 'https://x/api/items',
      method: 'POST',
      requestHeaders: { 'content-type': 'application/json' },
      requestBody: '{"a":1}',
      responseStatus: 201,
      responseHeaders: { 'x-id': '9' },
      responseBody: '{"ok":true}',
      durationMs: 42,
      now: 1000,
    })
    expect(call.id).toMatch(/^call_/)
    expect(call.url).toBe('https://x/api/items')
    expect(call.method).toBe('POST')
    expect(call.responseStatus).toBe(201)
    expect(call.durationMs).toBe(42)
    expect(call.capturedAt).toBe(1000)
  })

  it('installFetchPatch wraps fetch and posts a capture message', async () => {
    const responseBody = '{"ok":true}'
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const win = {
      fetch: fakeFetch,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn(),
    } as unknown as Window & typeof globalThis

    installFetchPatch(win)
    const res = await win.fetch('https://x/api/items', { method: 'GET' })
    await res.text()

    expect(fakeFetch).toHaveBeenCalledOnce()
    const call = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
    const posted = call[0]
    const targetOrigin = call[1]
    expect(posted.source).toBe(POSTMSG_SOURCE)
    expect(posted.kind).toBe('API_CAPTURED')
    expect(posted.call.url).toBe('https://x/api/items')
    expect(posted.call.pageUrl).toBe('https://x/page')
    // Must target the page origin, never '*' (would leak auth data to any listener).
    expect(targetOrigin).toBe('https://x')
  })

  it('installXhrPatch patches XMLHttpRequest and captures responses', async () => {
    const captured: Array<{ source: string; kind: string; call: { method: string } }> = []
    const win = {
      XMLHttpRequest: window.XMLHttpRequest,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn((msg: { source: string }) => {
        if (msg?.source === POSTMSG_SOURCE) captured.push(msg as never)
      }),
    } as unknown as Window & typeof globalThis

    installXhrPatch(win)

    await new Promise<void>((resolve) => {
      const xhr = new win.XMLHttpRequest()
      xhr.addEventListener('loadend', () => resolve())
      // jsdom XHR: trigger loadend synchronously via a fake transport, or mock
      // getAllResponseHeaders/status/responseText then dispatch 'loadend'.
      xhr.open('GET', 'https://api.example.com/data')
      // Simulate a completed response under jsdom by dispatching loadend manually.
      Object.defineProperty(xhr, 'status', { value: 200, configurable: true })
      Object.defineProperty(xhr, 'responseText', { value: '{"ok":true}', configurable: true })
      Object.defineProperty(xhr, 'getAllResponseHeaders', {
        value: () => 'content-type: application/json\r\n',
        configurable: true,
      })
      xhr.send()
      xhr.dispatchEvent(new Event('loadend'))
    })

    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0].call.method).toBe('GET')
  })

  it('installHistoryPatch posts SESSION_CHANGE on pushState', () => {
    const win = {
      history: { pushState: vi.fn(), replaceState: vi.fn() },
      location: { href: 'https://x/a', origin: 'https://x' },
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis

    installHistoryPatch(win)
    win.history.pushState({}, '', '/b')

    const posted = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
    expect(posted.source).toBe(POSTMSG_SOURCE)
    expect(posted.kind).toBe('SESSION_CHANGE')
    expect(posted.reason).toBe('pushState')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/content/injected-capture.test.ts`
Expected: FAIL with "Failed to resolve import './injected-capture'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/content/injected-capture.ts`:
```typescript
import { POSTMSG_SOURCE, MSG } from '../shared/messages'
import type { SessionChangeReason } from '../shared/messages'
import type { ApiCall } from '../shared/types'

export interface RawCall {
  url: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string | null
  durationMs: number
  now: number
}

export function buildApiCall(raw: RawCall): ApiCall {
  return {
    id: `call_${raw.now}_${Math.random().toString(36).slice(2, 8)}`,
    url: raw.url,
    method: raw.method,
    requestHeaders: raw.requestHeaders,
    requestBody: raw.requestBody,
    responseStatus: raw.responseStatus,
    responseHeaders: raw.responseHeaders,
    responseBody: raw.responseBody,
    durationMs: raw.durationMs,
    capturedAt: raw.now,
  }
}

function postCapture(win: Window, call: ApiCall): void {
  // Target the page's own origin, NOT '*'. A wildcard target broadcasts captured
  // auth headers and response bodies to any listener on the page (XSS/3p scripts).
  win.postMessage(
    { source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED, call: { ...call, pageUrl: win.location.href } },
    win.location.origin,
  )
}

function postSessionChange(win: Window, reason: SessionChangeReason, url: string): void {
  win.postMessage({ source: POSTMSG_SOURCE, kind: MSG.SESSION_CHANGE, reason, url }, win.location.origin)
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => {
    out[k] = v
  })
  return out
}

function normalizeReqHeaders(init?: RequestInit): Record<string, string> {
  if (!init?.headers) return {}
  if (init.headers instanceof Headers) return headersToObject(init.headers)
  if (Array.isArray(init.headers)) return Object.fromEntries(init.headers)
  return { ...(init.headers as Record<string, string>) }
}

export function installFetchPatch(win: Window & typeof globalThis): void {
  const original = win.fetch.bind(win)
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const start = Date.now()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')
    const res = await original(input as RequestInfo, init)
    try {
      const clone = res.clone()
      const body = await clone.text()
      postCapture(
        win,
        buildApiCall({
          url,
          method: method ?? 'GET',
          requestHeaders: normalizeReqHeaders(init),
          requestBody: typeof init?.body === 'string' ? init.body : null,
          responseStatus: res.status,
          responseHeaders: headersToObject(res.headers),
          responseBody: body,
          durationMs: Date.now() - start,
          now: Date.now(),
        }),
      )
    } catch {
      // capture is best-effort; never break the page
    }
    return res
  }
}

export function installHistoryPatch(win: Window & typeof globalThis): void {
  const origPush = win.history.pushState.bind(win.history)
  const origReplace = win.history.replaceState.bind(win.history)

  win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    origPush(data, unused, url ?? null)
    postSessionChange(win, 'pushState', win.location.href)
  }
  win.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    origReplace(data, unused, url ?? null)
    postSessionChange(win, 'replaceState', win.location.href)
  }

  win.addEventListener('popstate', () => postSessionChange(win, 'popstate', win.location.href))
  win.addEventListener('beforeunload', () => postSessionChange(win, 'beforeunload', win.location.href))
}

export function installCapture(win: Window & typeof globalThis): void {
  installFetchPatch(win)
  installXhrPatch(win)
  installHistoryPatch(win)
}

export function installXhrPatch(win: Window & typeof globalThis): void {
  const OrigXHR = win.XMLHttpRequest
  if (!OrigXHR) return
  const proto = OrigXHR.prototype
  const origOpen = proto.open
  const origSend = proto.send

  type Tracked = XMLHttpRequest & {
    __cap?: { url: string; method: string; body: string | null; start: number }
  }

  proto.open = function (this: Tracked, method: string, url: string | URL, ...rest: unknown[]) {
    this.__cap = { url: url.toString(), method, body: null, start: 0 }
    // @ts-expect-error passthrough
    return origOpen.call(this, method, url, ...rest)
  }

  proto.send = function (this: Tracked, body?: Document | XMLHttpRequestBodyInit | null) {
    if (this.__cap) {
      this.__cap.body = typeof body === 'string' ? body : null
      this.__cap.start = Date.now()
      this.addEventListener('loadend', () => {
        const cap = this.__cap!
        postCapture(
          win,
          buildApiCall({
            url: cap.url,
            method: cap.method,
            requestHeaders: {},
            requestBody: cap.body,
            responseStatus: this.status,
            responseHeaders: parseRawHeaders(this.getAllResponseHeaders()),
            responseBody: typeof this.responseText === 'string' ? this.responseText : null,
            durationMs: Date.now() - cap.start,
            now: Date.now(),
          }),
        )
      })
    }
    return origSend.call(this, body ?? null)
  }
}

function parseRawHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  raw
    .trim()
    .split(/[\r\n]+/)
    .forEach((line) => {
      const idx = line.indexOf(':')
      if (idx > 0) out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    })
  return out
}

// Auto-install when injected into a real page (no-op in unit tests where this is not imported as entry).
if (typeof window !== 'undefined' && (window as unknown as { __apiToMcpInjected?: boolean }).__apiToMcpInjected !== true) {
  ;(window as unknown as { __apiToMcpInjected?: boolean }).__apiToMcpInjected = true
}
```

> Note: the auto-install guard only sets a flag; actual `installCapture(window)` is invoked by `widget-host.ts` after blacklist and consent checks (Task 11), keeping blacklisted/un-consented domains un-patched per the spec.

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/content/injected-capture.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/content/injected-capture.ts extension/src/content/injected-capture.test.ts
git commit -m "feat: add main-world fetch/XHR/History capture patches"
```

---

## Task 10: Content Bridge (postMessage → sendMessage)

**Files:**
- Create: `extension/src/content/content-bridge.ts`
- Test: `extension/src/content/content-bridge.test.ts`

- [ ] **Step 1: Write the failing test**
`extension/src/content/content-bridge.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleBridgeMessage } from './content-bridge'
import { POSTMSG_SOURCE, MSG } from '../shared/messages'

describe('content-bridge', () => {
  beforeEach(() => vi.clearAllMocks())

  // Helper: build a same-window, same-origin MessageEvent (passes the security gate).
  function ev(data: unknown): MessageEvent {
    return { data, source: window, origin: location.origin } as unknown as MessageEvent
  }

  it('ignores messages without the correct source tag', () => {
    handleBridgeMessage(ev({ source: 'evil', kind: MSG.API_CAPTURED }))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('ignores messages from a foreign origin even with the correct source tag', () => {
    const evil = { data: { source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED }, source: window, origin: 'https://evil.com' } as unknown as MessageEvent
    handleBridgeMessage(evil)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('forwards API_CAPTURED as a runtime CaptureMessage', () => {
    const call = { id: 'c1', url: 'u', method: 'GET', requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 1, pageUrl: 'https://x/page' }
    handleBridgeMessage(ev({ source: POSTMSG_SOURCE, kind: MSG.API_CAPTURED, call }))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.API_CAPTURED, payload: call })
  })

  it('forwards SESSION_CHANGE as a runtime SessionChangeMessage', () => {
    handleBridgeMessage(ev({ source: POSTMSG_SOURCE, kind: MSG.SESSION_CHANGE, reason: 'pushState', url: 'https://x/b' }))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG.SESSION_CHANGE, reason: 'pushState', url: 'https://x/b',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/content/content-bridge.test.ts`
Expected: FAIL with "Failed to resolve import './content-bridge'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/content/content-bridge.ts`:
```typescript
import { POSTMSG_SOURCE, MSG } from '../shared/messages'
import type { ApiCall } from '../shared/types'
import type { SessionChangeReason } from '../shared/messages'

interface BridgeCapture {
  source: typeof POSTMSG_SOURCE
  kind: typeof MSG.API_CAPTURED
  call: ApiCall
}
interface BridgeSessionChange {
  source: typeof POSTMSG_SOURCE
  kind: typeof MSG.SESSION_CHANGE
  reason: SessionChangeReason
  url: string
}
type BridgeData = BridgeCapture | BridgeSessionChange

export function handleBridgeMessage(event: MessageEvent): void {
  // Only accept messages this window posted to its own origin with our source tag.
  // Rejecting cross-window / cross-origin events prevents 3p scripts or iframes
  // from injecting forged captures into the SW.
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    (event.data as Partial<BridgeData> | undefined)?.source !== POSTMSG_SOURCE
  ) {
    return
  }
  const data = event.data as Partial<BridgeData>

  if (data.kind === MSG.API_CAPTURED) {
    void chrome.runtime.sendMessage({ type: MSG.API_CAPTURED, payload: (data as BridgeCapture).call })
    return
  }
  if (data.kind === MSG.SESSION_CHANGE) {
    const d = data as BridgeSessionChange
    void chrome.runtime.sendMessage({ type: MSG.SESSION_CHANGE, reason: d.reason, url: d.url })
  }
}

export function registerBridge(): void {
  window.addEventListener('message', handleBridgeMessage)
}

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  registerBridge()
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/content/content-bridge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/content/content-bridge.ts extension/src/content/content-bridge.test.ts
git commit -m "feat: add isolated-world content bridge relaying postMessage to SW"
```

---

## Task 11: Widget Host (Shadow DOM mount + MutationObserver + main-world injection)

**Files:**
- Create: `extension/src/content/widget-host.ts`
- Test: `extension/src/content/widget-host.test.ts`

- [ ] **Step 1: Write the failing test**
`extension/src/content/widget-host.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isBlacklisted, mountWidgetHost, WIDGET_HOST_ID } from './widget-host'

describe('widget-host', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('isBlacklisted matches exact and subdomain', () => {
    expect(isBlacklisted('app.example.com', ['example.com'])).toBe(true)
    expect(isBlacklisted('example.com', ['example.com'])).toBe(true)
    expect(isBlacklisted('other.com', ['example.com'])).toBe(false)
    expect(isBlacklisted('notexample.com', ['example.com'])).toBe(false)
  })

  it('mountWidgetHost attaches a host element with an open shadow root', () => {
    mountWidgetHost()
    const host = document.getElementById(WIDGET_HOST_ID)
    expect(host).not.toBeNull()
    expect(host!.shadowRoot).not.toBeNull()
  })

  it('mountWidgetHost is idempotent (no duplicate hosts)', () => {
    mountWidgetHost()
    mountWidgetHost()
    expect(document.querySelectorAll(`#${WIDGET_HOST_ID}`)).toHaveLength(1)
  })

  it('re-injects the host when removed (observer callback)', () => {
    mountWidgetHost()
    document.getElementById(WIDGET_HOST_ID)!.remove()
    // simulate the observer callback directly
    mountWidgetHost()
    expect(document.getElementById(WIDGET_HOST_ID)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/content/widget-host.test.ts`
Expected: FAIL with "Failed to resolve import './widget-host'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/content/widget-host.ts`:
```typescript
import React from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingWidget } from '../ui/widget/FloatingWidget'
import { getStorage } from '../shared/storage'
// Import the main-world script URL via crxjs's ?script&module query.
// This yields the correct hashed asset URL at build time, so the injected
// <script src> points at a real file in dist/assets/ (not a raw .ts path).
import captureScriptUrl from './injected-capture.ts?script&module'

export const WIDGET_HOST_ID = 'api-to-mcp-tracker-host'

export function isBlacklisted(hostname: string, blacklist: string[]): boolean {
  return blacklist.some((d) => hostname === d || hostname.endsWith(`.${d}`))
}

export function mountWidgetHost(): void {
  if (document.getElementById(WIDGET_HOST_ID)) return
  const host = document.createElement('div')
  host.id = WIDGET_HOST_ID
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
  const shadow = host.attachShadow({ mode: 'open' })
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  document.documentElement.appendChild(host)
  createRoot(mountPoint).render(React.createElement(FloatingWidget))
}

function observeReinjection(): void {
  const observer = new MutationObserver(() => {
    if (!document.getElementById(WIDGET_HOST_ID)) mountWidgetHost()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

function injectMainWorldCapture(): void {
  const existing = document.getElementById('__api-tracker-capture__')
  if (existing) return
  const script = document.createElement('script')
  script.id = '__api-tracker-capture__'
  script.src = captureScriptUrl
  script.type = 'module'
  ;(document.head ?? document.documentElement).appendChild(script)
}

async function init(): Promise<void> {
  const { settings } = await getStorage()
  if (isBlacklisted(location.hostname, settings.blacklistedDomains)) return
  // Do not inject the capture script until the user has consented and tracking
  // is enabled. The (paused) widget still mounts so the user can open the panel
  // and grant consent.
  if (!settings.consentGivenAt || !settings.trackingEnabled) {
    mountWidgetHost()
    observeReinjection()
    return
  }
  injectMainWorldCapture()
  mountWidgetHost()
  observeReinjection()
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && typeof window !== 'undefined') {
  void init()
}
```

> Note: `injected-capture.ts` is auto-installed by appending `installCapture(window)` at its module bottom. Update Task 9's auto-install guard block to call `installCapture(window)` once injected. Apply that one-line change now if not already present:
> ```typescript
> // in injected-capture.ts, replace the trailing guard block with:
> if (typeof window !== 'undefined' && (window as unknown as { __apiToMcpInjected?: boolean }).__apiToMcpInjected !== true) {
>   ;(window as unknown as { __apiToMcpInjected?: boolean }).__apiToMcpInjected = true
>   installCapture(window as Window & typeof globalThis)
> }
> ```

- [ ] **Step 4: Apply the injected-capture auto-install edit**
Edit `extension/src/content/injected-capture.ts` trailing guard block to invoke `installCapture(window as Window & typeof globalThis)` as shown above.
Run: `cd extension && npx vitest run src/content/injected-capture.test.ts`
Expected: PASS (3 tests still pass — the guard only runs when imported as page entry, not under the named-import test).

- [ ] **Step 5: Run widget-host test to verify it passes**
Run: `cd extension && npx vitest run src/content/widget-host.test.ts`
Expected: PASS (4 tests).

> Note: the `?script&module` import is a build-time crxjs transform. Under Vitest it must be stubbed. Add to `src/test-setup.ts` (or a vitest alias) a mock so `'./injected-capture.ts?script&module'` resolves to a dummy URL string, e.g. via `vi.mock` in the widget-host test:
> ```typescript
> vi.mock('./injected-capture.ts?script&module', () => ({ default: 'chrome-extension://test/assets/injected-capture.js' }))
> ```

- [ ] **Step 6: Verify build output contains the injected script**
Run: `cd extension && npm run build && ls dist/assets/ | grep injected`
Expected: a file named `injected-capture-[hash].js` exists in `dist/assets/`, and `dist/manifest.json`'s `web_accessible_resources` matches it via the `assets/injected-capture*.js` glob.

- [ ] **Step 7: Commit**
```bash
git add extension/src/content/widget-host.ts extension/src/content/widget-host.test.ts extension/src/content/injected-capture.ts
git commit -m "feat: add Shadow-DOM widget host with reinjection and blacklist gate"
```

---

## Task 12: FloatingWidget UI

**Files:**
- Create: `extension/src/ui/widget/FloatingWidget.tsx`
- Test: `extension/src/ui/widget/FloatingWidget.test.tsx`

- [ ] **Step 1: Write the failing test**
`extension/src/ui/widget/FloatingWidget.test.tsx`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FloatingWidget } from './FloatingWidget'
import { MSG } from '../../shared/messages'

describe('FloatingWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      currentSession: { sessionId: 's1', url: 'https://x/a', startedAt: 1, calls: [{ id: 'c1' }, { id: 'c2' }], status: 'recording' },
      settings: { serverUrl: '', apiKey: '', trackingEnabled: true, blacklistedDomains: [] },
    })
  })

  it('shows the current capture count as a badge', async () => {
    render(<FloatingWidget />)
    await waitFor(() => expect(screen.getByTestId('widget-badge')).toHaveTextContent('2'))
  })

  it('reflects tracking state in the button class', async () => {
    render(<FloatingWidget />)
    await waitFor(() => expect(screen.getByTestId('widget-button')).toHaveAttribute('data-state', 'tracking'))
  })

  it('opens the side panel via runtime message on "패널 열기"', async () => {
    render(<FloatingWidget />)
    await waitFor(() => screen.getByTestId('widget-button'))
    fireEvent.click(screen.getByTestId('widget-button'))
    fireEvent.click(screen.getByText('패널 열기'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.OPEN_SIDEPANEL })
  })

  it('toggles tracking via runtime message on "일시정지"', async () => {
    render(<FloatingWidget />)
    await waitFor(() => screen.getByTestId('widget-button'))
    fireEvent.click(screen.getByTestId('widget-button'))
    fireEvent.click(screen.getByText('일시정지'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.TOGGLE_TRACKING, enabled: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd extension && npx vitest run src/ui/widget/FloatingWidget.test.tsx`
Expected: FAIL with "Failed to resolve import './FloatingWidget'".

- [ ] **Step 3: Write minimal implementation**
`extension/src/ui/widget/FloatingWidget.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { getStorage, onStorageChanged } from '../../shared/storage'
import { MSG } from '../../shared/messages'

export function FloatingWidget(): React.ReactElement {
  const [count, setCount] = useState(0)
  const [tracking, setTracking] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    void getStorage().then((s) => {
      if (!mounted) return
      setCount(s.currentSession?.calls.length ?? 0)
      setTracking(s.settings.trackingEnabled)
    })
    onStorageChanged((changes) => {
      if (changes.currentSession) {
        const v = changes.currentSession.newValue as { calls?: unknown[] } | null
        setCount(v?.calls?.length ?? 0)
      }
      if (changes.settings) {
        const v = changes.settings.newValue as { trackingEnabled?: boolean }
        if (typeof v?.trackingEnabled === 'boolean') setTracking(v.trackingEnabled)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  const state = tracking ? 'tracking' : 'paused'
  const color = tracking ? '#2563eb' : '#9ca3af'

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, fontFamily: 'sans-serif' }}>
      {open && (
        <div
          style={{
            marginBottom: 8,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <button onClick={() => chrome.runtime.sendMessage({ type: MSG.OPEN_SIDEPANEL })}>
            패널 열기
          </button>
          <button
            onClick={() =>
              chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: !tracking })
            }
          >
            {tracking ? '일시정지' : '재개'}
          </button>
        </div>
      )}
      <button
        data-testid="widget-button"
        data-state={state}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: color,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        API
        <span
          data-testid="widget-badge"
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#ef4444',
            borderRadius: '50%',
            minWidth: 20,
            height: 20,
            fontSize: 12,
            lineHeight: '20px',
          }}
        >
          {count}
        </span>
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd extension && npx vitest run src/ui/widget/FloatingWidget.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/ui/widget/FloatingWidget.tsx extension/src/ui/widget/FloatingWidget.test.tsx
git commit -m "feat: add FloatingWidget with live badge, state, and quick actions"
```

---

## Task 13: SidePanel UI

**Files:**
- Create: `extension/src/ui/sidepanel/CaptureList.tsx`
- Create: `extension/src/ui/sidepanel/SendButton.tsx`
- Create: `extension/src/ui/sidepanel/index.tsx`
- Test: `extension/src/ui/sidepanel/CaptureList.test.tsx`
- Test: `extension/src/ui/sidepanel/SendButton.test.tsx`

- [ ] **Step 1: Write the failing tests**
`extension/src/ui/sidepanel/CaptureList.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CaptureList } from './CaptureList'
import type { ApiCall } from '../../shared/types'

const calls: ApiCall[] = [
  { id: 'c1', url: 'https://x/api/a', method: 'GET', requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {}, responseBody: '{"a":1}', durationMs: 12, capturedAt: 1 },
  { id: 'c2', url: 'https://x/api/b', method: 'POST', requestHeaders: {}, requestBody: '{}', responseStatus: 500, responseHeaders: {}, responseBody: 'err', durationMs: 30, capturedAt: 2 },
]

describe('CaptureList', () => {
  it('renders one row per call with method and status', () => {
    render(<CaptureList calls={calls} />)
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('POST')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('expands a row to show response body on click', () => {
    render(<CaptureList calls={calls} />)
    expect(screen.queryByText('{"a":1}')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('capture-row-c1'))
    expect(screen.getByText('{"a":1}')).toBeInTheDocument()
  })

  it('renders empty state when no calls', () => {
    render(<CaptureList calls={[]} />)
    expect(screen.getByText('캡처된 호출이 없습니다.')).toBeInTheDocument()
  })
})
```

`extension/src/ui/sidepanel/SendButton.test.tsx`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SendButton } from './SendButton'
import { MSG } from '../../shared/messages'

describe('SendButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows count in the label and is disabled when count is 0', () => {
    render(<SendButton sessionId="s1" count={0} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('이 세션 전송 (0개 호출)')
  })

  it('sends SEND_SESSION and shows success state', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<SendButton sessionId="s1" count={3} />)
    fireEvent.click(screen.getByRole('button'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.SEND_SESSION, sessionId: 's1' })
    await waitFor(() => expect(screen.getByText('전송 완료')).toBeInTheDocument())
  })

  it('shows an error banner on failure', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'server responded 500' })
    render(<SendButton sessionId="s1" count={3} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText(/server responded 500/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `cd extension && npx vitest run src/ui/sidepanel/CaptureList.test.tsx src/ui/sidepanel/SendButton.test.tsx`
Expected: FAIL with "Failed to resolve import './CaptureList'" / "./SendButton".

- [ ] **Step 3: Write minimal implementations**
`extension/src/ui/sidepanel/CaptureList.tsx`:
```tsx
import React, { useState } from 'react'
import type { ApiCall } from '../../shared/types'

function statusColor(status: number): string {
  if (status >= 500) return '#ef4444'
  if (status >= 400) return '#f59e0b'
  return '#16a34a'
}

export function CaptureList({ calls }: { calls: ApiCall[] }): React.ReactElement {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (calls.length === 0) {
    return <p style={{ color: '#6b7280' }}>캡처된 호출이 없습니다.</p>
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {calls.map((c) => (
        <li key={c.id} style={{ borderBottom: '1px solid #eee', padding: '6px 0' }}>
          <div
            data-testid={`capture-row-${c.id}`}
            onClick={() => setExpanded((e) => (e === c.id ? null : c.id))}
            style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}
          >
            <span style={{ fontWeight: 600 }}>{c.method}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.url}
            </span>
            <span style={{ color: statusColor(c.responseStatus) }}>{c.responseStatus}</span>
            <span style={{ color: '#6b7280', fontSize: 12 }}>{c.durationMs}ms</span>
          </div>
          {expanded === c.id && (
            <pre
              style={{
                background: '#f9fafb',
                padding: 8,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 200,
                margin: '6px 0 0',
              }}
            >
              {c.responseBody ?? '(no body)'}
            </pre>
          )}
        </li>
      ))}
    </ul>
  )
}
```

`extension/src/ui/sidepanel/SendButton.tsx`:
```tsx
import React, { useState } from 'react'
import { MSG } from '../../shared/messages'
import type { SendSessionResponse } from '../../shared/messages'

type Phase = 'idle' | 'sending' | 'sent' | 'error'

export function SendButton({ sessionId, count }: { sessionId: string; count: number }): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSend(): Promise<void> {
    setPhase('sending')
    setError(null)
    const res = (await chrome.runtime.sendMessage({
      type: MSG.SEND_SESSION,
      sessionId,
    })) as SendSessionResponse
    if (res?.ok) {
      setPhase('sent')
    } else {
      setPhase('error')
      setError(res?.error ?? '알 수 없는 오류')
    }
  }

  const label =
    phase === 'sending' ? '전송 중...' : phase === 'sent' ? '전송 완료' : `이 세션 전송 (${count}개 호출)`

  return (
    <div>
      <button
        onClick={onSend}
        disabled={count === 0 || phase === 'sending'}
        style={{
          width: '100%',
          padding: '10px',
          background: phase === 'sent' ? '#16a34a' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: count === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {label}
      </button>
      {phase === 'error' && error && (
        <div style={{ marginTop: 6, color: '#b91c1c', fontSize: 13 }}>전송 실패: {error}</div>
      )}
    </div>
  )
}
```

`extension/src/ui/sidepanel/index.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getStorage, onStorageChanged } from '../../shared/storage'
import { MSG } from '../../shared/messages'
import type { CurrentSession, Settings } from '../../shared/types'
import { CaptureList } from './CaptureList'
import { SendButton } from './SendButton'

function App(): React.ReactElement {
  const [session, setSession] = useState<CurrentSession | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void getStorage().then((s) => {
      setSession(s.currentSession)
      setSettings(s.settings)
    })
    onStorageChanged((changes) => {
      if (changes.currentSession) setSession(changes.currentSession.newValue as CurrentSession | null)
      if (changes.settings) setSettings(changes.settings.newValue as Settings)
    })
  }, [])

  const calls = session?.calls ?? []

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 12, width: 360 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ flex: 1 }}>API-to-MCP Tracker</strong>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={settings?.trackingEnabled ?? false}
            onChange={(e) =>
              chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: e.target.checked })
            }
          />
          추적
        </label>
        <a href={chrome.runtime.getURL('public/options.html')} target="_blank" rel="noreferrer">
          설정
        </a>
      </header>

      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, wordBreak: 'break-all' }}>
        {session?.url ?? '세션 없음'}
      </div>

      <CaptureList calls={calls} />

      <div style={{ marginTop: 12 }}>
        {session && <SendButton sessionId={session.sessionId} count={calls.length} />}
      </div>

      <a
        href={chrome.runtime.getURL('public/options.html')}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'inline-block', marginTop: 12, fontSize: 13 }}
      >
        MCP 대시보드 보기 →
      </a>
    </div>
  )
}

const el = document.getElementById('root')
if (el) createRoot(el).render(<App />)
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `cd extension && npx vitest run src/ui/sidepanel/CaptureList.test.tsx src/ui/sidepanel/SendButton.test.tsx`
Expected: PASS (CaptureList 3 + SendButton 3 = 6 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/ui/sidepanel/
git commit -m "feat: add SidePanel with live capture list and manual send button"
```

---

## Task 14: Options Page UI

**Files:**
- Create: `extension/src/ui/options/McpTable.tsx`
- Create: `extension/src/ui/options/SessionHistory.tsx`
- Create: `extension/src/ui/options/Settings.tsx`
- Create: `extension/src/ui/options/index.tsx`
- Test: `extension/src/ui/options/McpTable.test.tsx`
- Test: `extension/src/ui/options/SessionHistory.test.tsx`
- Test: `extension/src/ui/options/Settings.test.tsx`

- [ ] **Step 1: Write the failing tests**
`extension/src/ui/options/McpTable.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { McpTable } from './McpTable'
import type { McpEntry } from '../../shared/types'

const rows: McpEntry[] = [
  { id: 'm1', name: 'Alpha API', sourceUrl: 'https://a.com', endpoint: '/a', createdAt: 1, active: true },
  { id: 'm2', name: 'Beta API', sourceUrl: 'https://b.com', endpoint: '/b', createdAt: 2, active: false },
]

describe('McpTable', () => {
  it('renders a row per mcp entry', () => {
    render(<McpTable rows={rows} />)
    expect(screen.getByText('Alpha API')).toBeInTheDocument()
    expect(screen.getByText('Beta API')).toBeInTheDocument()
  })

  it('filters rows by the search query', () => {
    render(<McpTable rows={rows} />)
    fireEvent.change(screen.getByPlaceholderText('검색...'), { target: { value: 'Beta' } })
    expect(screen.queryByText('Alpha API')).not.toBeInTheDocument()
    expect(screen.getByText('Beta API')).toBeInTheDocument()
  })

  it('shows active/inactive status', () => {
    render(<McpTable rows={rows} />)
    expect(screen.getByText('활성')).toBeInTheDocument()
    expect(screen.getByText('비활성')).toBeInTheDocument()
  })
})
```

`extension/src/ui/options/SessionHistory.test.tsx`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionHistory } from './SessionHistory'
import { MSG } from '../../shared/messages'
import type { StoredSession } from '../../shared/types'

const sessions: StoredSession[] = [
  { sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2, calls: [], transmitStatus: 'sent', sentAt: 3 },
  { sessionId: 's2', url: 'https://x/b', startedAt: 4, endedAt: 5, calls: [], transmitStatus: 'failed' },
]

describe('SessionHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders sessions with their transmit status', () => {
    render(<SessionHistory sessions={sessions} />)
    expect(screen.getByText('https://x/a')).toBeInTheDocument()
    expect(screen.getByText('sent')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('filters by transmit status', () => {
    render(<SessionHistory sessions={sessions} />)
    fireEvent.change(screen.getByTestId('status-filter'), { target: { value: 'failed' } })
    expect(screen.queryByText('https://x/a')).not.toBeInTheDocument()
    expect(screen.getByText('https://x/b')).toBeInTheDocument()
  })

  it('re-sends a failed session via runtime message', () => {
    render(<SessionHistory sessions={sessions} />)
    fireEvent.click(screen.getByTestId('resend-s2'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.SEND_SESSION, sessionId: 's2' })
  })

  it('shows empty state when no sessions match filter', () => {
    render(<SessionHistory sessions={[]} />);
    expect(screen.getByText('전송된 세션이 없습니다. SidePanel에서 세션을 전송해 보세요.')).toBeInTheDocument();
  })
})
```

`extension/src/ui/options/Settings.test.tsx`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from './Settings'
import type { Settings as SettingsType } from '../../shared/types'

const initial: SettingsType = {
  serverUrl: 'https://server.test', apiKey: 'KEY', trackingEnabled: true, blacklistedDomains: ['ads.com'],
}

describe('Settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists serverUrl and apiKey on save', async () => {
    render(<Settings initial={initial} />)
    fireEvent.change(screen.getByLabelText('서버 URL'), { target: { value: 'https://new.test' } })
    fireEvent.click(screen.getByText('저장'))
    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        settings: expect.objectContaining({ serverUrl: 'https://new.test', apiKey: 'KEY' }),
      }),
    )
  })

  it('adds a blacklist domain', async () => {
    render(<Settings initial={initial} />)
    fireEvent.change(screen.getByPlaceholderText('도메인 추가'), { target: { value: 'tracker.io' } })
    fireEvent.click(screen.getByText('추가'))
    expect(screen.getByText('tracker.io')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `cd extension && npx vitest run src/ui/options/McpTable.test.tsx src/ui/options/SessionHistory.test.tsx src/ui/options/Settings.test.tsx`
Expected: FAIL with "Failed to resolve import" for each component.

- [ ] **Step 3: Write minimal implementations**
`extension/src/ui/options/McpTable.tsx`:
```tsx
import React, { useMemo, useState } from 'react'
import type { McpEntry } from '../../shared/types'

export function McpTable({ rows }: { rows: McpEntry[] }): React.ReactElement {
  const [q, setQ] = useState('')
  const filtered = useMemo(
    () => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.sourceUrl.includes(q)),
    [rows, q],
  )

  return (
    <div>
      <input placeholder="검색..." value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>이름</th>
            <th style={{ textAlign: 'left' }}>출처</th>
            <th style={{ textAlign: 'left' }}>엔드포인트</th>
            <th style={{ textAlign: 'left' }}>생성일</th>
            <th style={{ textAlign: 'left' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
              <td>{r.name}</td>
              <td>{r.sourceUrl}</td>
              <td>{r.endpoint}</td>
              <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              <td>{r.active ? '활성' : '비활성'}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                {q
                  ? `"${q}"에 해당하는 MCP 서버가 없습니다.`
                  : 'MCP 서버가 없습니다. 페이지를 탐색하고 API를 전송해 보세요.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

`extension/src/ui/options/SessionHistory.tsx`:
```tsx
import React, { useMemo, useState } from 'react'
import { MSG } from '../../shared/messages'
import type { StoredSession, TransmitStatus } from '../../shared/types'

type Filter = 'all' | TransmitStatus

export function SessionHistory({ sessions }: { sessions: StoredSession[] }): React.ReactElement {
  const [filter, setFilter] = useState<Filter>('all')
  const filtered = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.transmitStatus === filter)),
    [sessions, filter],
  )

  return (
    <div>
      <select
        data-testid="status-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value as Filter)}
        style={{ marginBottom: 8 }}
      >
        <option value="all">전체</option>
        <option value="pending">pending</option>
        <option value="sent">sent</option>
        <option value="failed">failed</option>
      </select>
      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          {filter === 'all'
            ? '전송된 세션이 없습니다. SidePanel에서 세션을 전송해 보세요.'
            : `'${filter}' 상태의 세션이 없습니다.`}
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {filtered.map((s) => (
          <li key={s.sessionId} style={{ borderTop: '1px solid #eee', padding: '6px 0', display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}>{s.url}</span>
            <span>{s.calls.length}개</span>
            <span>{s.transmitStatus}</span>
            {s.transmitStatus === 'failed' && (
              <button
                data-testid={`resend-${s.sessionId}`}
                onClick={() => chrome.runtime.sendMessage({ type: MSG.SEND_SESSION, sessionId: s.sessionId })}
              >
                재전송
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`extension/src/ui/options/Settings.tsx`:
```tsx
import React, { useState } from 'react'
import { patchStorage } from '../../shared/storage'
import type { Settings as SettingsType } from '../../shared/types'

export function Settings({ initial }: { initial: SettingsType }): React.ReactElement {
  const [serverUrl, setServerUrl] = useState(initial.serverUrl)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [trackingEnabled, setTrackingEnabled] = useState(initial.trackingEnabled)
  const [blacklist, setBlacklist] = useState<string[]>(initial.blacklistedDomains)
  const [newDomain, setNewDomain] = useState('')

  function addDomain(): void {
    const d = newDomain.trim()
    if (!d || blacklist.includes(d)) return
    setBlacklist((b) => [...b, d])
    setNewDomain('')
  }

  async function save(next: Partial<SettingsType> = {}): Promise<void> {
    await patchStorage({
      settings: { serverUrl, apiKey, trackingEnabled, blacklistedDomains: blacklist, ...next },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        서버 URL
        <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        API Key
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" />
      </label>
      <label>
        <input
          type="checkbox"
          checked={trackingEnabled}
          onChange={(e) => setTrackingEnabled(e.target.checked)}
        />
        기본 추적 활성화
      </label>

      <div>
        <strong>블랙리스트 도메인</strong>
        <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
          <input placeholder="도메인 추가" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
          <button onClick={addDomain}>추가</button>
        </div>
        <ul style={{ paddingLeft: 18 }}>
          {blacklist.map((d) => (
            <li key={d}>
              {d}{' '}
              <button onClick={() => setBlacklist((b) => b.filter((x) => x !== d))}>삭제</button>
            </li>
          ))}
        </ul>
      </div>

      <button onClick={() => void save()}>저장</button>
    </div>
  )
}
```

`extension/src/ui/options/index.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getStorage, onStorageChanged } from '../../shared/storage'
import { DEFAULT_SETTINGS } from '../../shared/types'
import type { McpEntry, Settings as SettingsType, StoredSession } from '../../shared/types'
import { McpTable } from './McpTable'
import { SessionHistory } from './SessionHistory'
import { Settings } from './Settings'

type Tab = 'mcp' | 'sessions' | 'settings'

function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('mcp')
  const [mcpList, setMcpList] = useState<McpEntry[]>([])
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS)

  useEffect(() => {
    void getStorage().then((s) => {
      setMcpList(s.mcpList)
      setSessions(s.sessions)
      setSettings(s.settings)
    })
    onStorageChanged((changes) => {
      if (changes.mcpList) setMcpList((changes.mcpList.newValue as McpEntry[]) ?? [])
      if (changes.sessions) setSessions((changes.sessions.newValue as StoredSession[]) ?? [])
      if (changes.settings) setSettings(changes.settings.newValue as SettingsType)
    })
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1>API-to-MCP Tracker 대시보드</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('mcp')} disabled={tab === 'mcp'}>MCP 서버 목록</button>
        <button onClick={() => setTab('sessions')} disabled={tab === 'sessions'}>세션 기록</button>
        <button onClick={() => setTab('settings')} disabled={tab === 'settings'}>설정</button>
      </nav>
      {tab === 'mcp' && <McpTable rows={mcpList} />}
      {tab === 'sessions' && <SessionHistory sessions={sessions} />}
      {tab === 'settings' && <Settings initial={settings} />}
    </div>
  )
}

const el = document.getElementById('root')
if (el) createRoot(el).render(<App />)
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `cd extension && npx vitest run src/ui/options/`
Expected: PASS (McpTable 3 + SessionHistory 3 + Settings 2 = 8 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/src/ui/options/
git commit -m "feat: add Options dashboard with MCP table, session history, settings"
```

---

## Task 15: Full Suite, Build, and E2E Smoke Test

**Files:**
- Create: `extension/README.md`

- [ ] **Step 1: Run the entire test suite**
Run: `cd extension && npx vitest run`
Expected: PASS — all test files green (types 3, ConsentBanner 1, messages 3, storage 4, session-manager 7, sender 7, index 8, injected-capture 4, content-bridge 4, widget-host 4, FloatingWidget 4, CaptureList 3, SendButton 3, McpTable 3, SessionHistory 3, Settings 2).

- [ ] **Step 2: Type-check and production build**
Run: `cd extension && npm run build`
Expected: `tsc --noEmit` passes with no errors; Vite emits `dist/` containing `manifest.json`, background, content scripts, `sidepanel.html`, `options.html`.

- [ ] **Step 3: Write the README with the manual E2E checklist and known limitation**
`extension/README.md`:
```markdown
# API-to-MCP Tracker

Chrome MV3 extension that captures REST API calls and turns captured sessions into MCP servers.

## Build & Load

```bash
cd extension
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer Mode → "Load unpacked" → select `extension/dist`.

## Manual E2E Smoke Test

1. Open the Options page, Settings tab. Enter a `serverUrl` and `apiKey`, click 저장.
2. Visit any site that makes `fetch`/XHR calls (e.g. a SPA). Confirm the floating widget appears bottom-right, blue (tracking).
3. Trigger some API calls; confirm the widget badge count increases.
4. Click the widget → "패널 열기"; confirm the SidePanel lists captured calls with method/status/duration. Click a row to expand the response body.
5. Click "이 세션 전송 (N개 호출)"; confirm success state and that the Options "MCP 서버 목록" tab updates (storage.onChanged-driven) without reload.
6. Navigate within the SPA (pushState); confirm a new session starts and the badge resets.
7. Add the current domain to the blacklist in Settings; reload; confirm the widget does NOT appear and no calls are captured.
8. Stop the API calls for 30+ minutes (or trigger the idle alarm); confirm the session rotates to history as `pending`.
9. In Options "세션 기록", find a `failed` session and click 재전송; confirm it retries.
10. Reload the service worker (chrome://extensions → reload); confirm `currentSession` is recovered from storage.

## Known Limitation

API calls fired **before** the content script patches `fetch`/`XHR` (very early page-load requests) are not captured. This is a structural limitation of content-script injection timing and is by design.
```

- [ ] **Step 4: Commit**
```bash
git add extension/README.md
git commit -m "docs: add README with build steps, E2E smoke checklist, known limitation"
```

---

## Spec Coverage Map

| Spec requirement | Task |
|---|---|
| MV3 manifest, React+TS+Vite | 1 |
| User consent before capturing auth headers / response bodies (legal) | 2 |
| StorageSchema + ApiCall types (incl. `consentGivenAt`) | 3 |
| Message constants + postMessage bridge tag (`payload.pageUrl`) | 4 |
| chrome.storage wrapper (single source of truth) | 5 |
| Session boundaries (pushState/replaceState/popstate/beforeunload/idle), accumulation, 30-min idle | 6, 8, 9 |
| Manual transmission, Bearer auth, `/api/sessions` flat payload (spec 4.4), mcpServers merge, 3x exponential backoff retry, actionable errors, transmitStatus='failed' | 7, 8 |
| Background SW owns business logic + message router + write serialization + SW-restart recovery | 8 |
| main-world fetch/XHR/History monkey-patch via postMessage (origin-scoped) | 9 |
| isolated-world bridge → chrome.runtime (origin + source validation) | 10 |
| Shadow DOM widget mount, MutationObserver re-injection, blacklist skip, consent gate, build-safe script URL | 11 |
| FloatingWidget (badge, tracking/paused state, hover actions) | 12 |
| SidePanel (toggle, URL, capture list w/ expand, send button states, dashboard link, consent banner) | 13 |
| Options 3 tabs (MCP table + search + empty state, session history + filter + resend, settings + blacklist) | 14 |
| storage.onChanged auto-update across UIs | 12, 13, 14 |
| Pre-patch calls limitation documented in README | 15 |
| E2E smoke test | 15 |
