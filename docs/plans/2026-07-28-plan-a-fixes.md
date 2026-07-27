# A안 수정 구현 계획 — 수동 전송·URL 절대화·전송 필터링·세션 이름

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수동 전송 버그(session not found)와 상대경로 URL 버그를 고치고, 전송 전 체리픽 필터링·세션 이름 지정·개별 삭제를 추가한다.

**Architecture:** 순수 함수 라우터(`handleMessage`) + `chrome.storage.local` 단일 상태 구조를 유지한다. 신규 메시지 `SEND_CURRENT_SESSION`(체리픽 전송)과 `DELETE_CALL`을 추가하고, `splitAndArchive`로 현재 세션을 선택분(아카이브+전송)/미선택분(새 세션 잔류)으로 분할한다. URL은 캡처 시점(`injected-capture`)에 절대화한다.

**Tech Stack:** Chrome MV3, Vite 5 + @crxjs, React 18, TypeScript 5(strict), Vitest 2 + Testing Library.

**Spec:** `docs/specs/2026-07-28-plan-a-fixes-design.md`

**실행 전 필수:**
- `superpowers:using-git-worktrees`로 격리 워크트리를 먼저 만든다 (`.claude/rules/superpowers.md` 강제 규약).
- 워크트리에 `node_modules`를 **심링크하지 말 것** — React 중복으로 컴포넌트 테스트 전체가 깨진다
  (`docs/solutions/integration-issues/worktree-symlinked-node-modules-duplicate-react.md`). `npm install`을 새로 실행한다.
- vitest는 esbuild 변환이라 **타입 오류를 잡지 않는다**. 각 태스크 커밋 전 `npx tsc --noEmit`이 진짜 게이트
  (`docs/solutions/testing/vitest-esbuild-skips-type-checking.md`).

**검증 명령:**
```bash
npx vitest run src/path/to/file.test.ts   # 단일 파일
npm run test:run                           # 전체 1회
npx tsc --noEmit                           # 타입체크
npm run build                              # tsc + vite build → dist/
```

---

### Task 1: 메시지 타입 추가 (SEND_CURRENT_SESSION · DELETE_CALL)

**Files:**
- Modify: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/shared/messages.test.ts`의 describe 블록 안에 추가:

```ts
  it('exposes cherry-pick send and delete-call message types', () => {
    expect(MSG.SEND_CURRENT_SESSION).toBe('SEND_CURRENT_SESSION')
    expect(MSG.DELETE_CALL).toBe('DELETE_CALL')
  })

  it('SendCurrentSessionMessage and DeleteCallMessage are constructable', () => {
    const sendCur: SendCurrentSessionMessage = {
      type: MSG.SEND_CURRENT_SESSION,
      name: '내 세션',
      callIds: ['c1', 'c2'],
    }
    const del: DeleteCallMessage = { type: MSG.DELETE_CALL, callId: 'c1' }
    expect(sendCur.callIds).toHaveLength(2)
    expect(del.callId).toBe('c1')
  })
```

파일 상단 import에 타입 추가:

```ts
import type { CaptureMessage, SendSessionMessage, SendCurrentSessionMessage, DeleteCallMessage } from './messages'
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `SEND_CURRENT_SESSION` 속성/타입 없음

- [ ] **Step 3: 구현**

`src/shared/messages.ts`의 `MSG`에 두 항목 추가:

```ts
export const MSG = {
  API_CAPTURED: 'API_CAPTURED',
  SESSION_CHANGE: 'SESSION_CHANGE',
  SEND_SESSION: 'SEND_SESSION',
  SEND_CURRENT_SESSION: 'SEND_CURRENT_SESSION',
  DELETE_CALL: 'DELETE_CALL',
  TOGGLE_TRACKING: 'TOGGLE_TRACKING',
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
} as const
```

`SendSessionMessage` 인터페이스 아래에 추가:

```ts
export interface SendCurrentSessionMessage {
  type: typeof MSG.SEND_CURRENT_SESSION
  name?: string // 세션 이름 (선택) — 아카이브·페이로드에 스탬프
  callIds: string[] // 전송 대상으로 선택된 호출 id (체리픽)
}

export interface DeleteCallMessage {
  type: typeof MSG.DELETE_CALL
  callId: string
}
```

`RuntimeMessage` 유니온에 두 타입 추가:

```ts
export type RuntimeMessage =
  | CaptureMessage
  | SessionChangeMessage
  | SendSessionMessage
  | SendCurrentSessionMessage
  | DeleteCallMessage
  | ToggleTrackingMessage
  | OpenSidePanelMessage
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/shared/messages.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: SEND_CURRENT_SESSION·DELETE_CALL 메시지 타입 추가"
```

---

### Task 2: StoredSession에 name 필드 추가

**Files:**
- Modify: `src/shared/types.ts`
- Test: `src/shared/types.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/shared/types.test.ts`의 describe 블록 안에 추가:

```ts
  it('StoredSession accepts an optional name', () => {
    const s: StoredSession = {
      sessionId: 's1', url: 'https://x/a', startedAt: 1, endedAt: 2,
      calls: [], transmitStatus: 'pending', name: '결제 API 세션',
    }
    expect(s.name).toBe('결제 API 세션')
  })
```

(파일 상단에 `StoredSession` import가 없으면 추가.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx tsc --noEmit`
Expected: FAIL — `name` 속성이 `StoredSession`에 없음 (vitest는 타입 오류를 잡지 않으므로 tsc로 확인)

- [ ] **Step 3: 구현**

`src/shared/types.ts`의 `StoredSession`에 필드 추가:

```ts
export interface StoredSession {
  sessionId: string
  name?: string // 사용자가 전송 시 지정한 세션 이름 (선택)
  url: string
  startedAt: number
  endedAt: number
  calls: ApiCall[]
  transmitStatus: TransmitStatus
  sentAt?: number
}
```

- [ ] **Step 4: 확인 후 커밋**

Run: `npx vitest run src/shared/types.test.ts && npx tsc --noEmit`
Expected: PASS

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat: StoredSession에 name 필드 추가"
```

---

### Task 3: splitAndArchive — 세션 체리픽 분할

**Files:**
- Modify: `src/background/session-manager.ts`
- Test: `src/background/session-manager.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/session-manager.test.ts` describe 블록 끝에 추가 (기존 `makeCall` 헬퍼 재사용):

```ts
  describe('splitAndArchive', () => {
    function recorded(ids: string[]): StorageSchema {
      return {
        ...DEFAULT_STORAGE,
        currentSession: {
          sessionId: 'cur', url: 'https://x/page', startedAt: 1000,
          calls: ids.map((id) => makeCall(id)), status: 'recording',
        },
      }
    }

    it('archives selected calls as pending with the given name', () => {
      const next = splitAndArchive(recorded(['a', 'b', 'c']), ['a', 'c'], '내 세션', 2000)
      expect(next.sessions).toHaveLength(1)
      expect(next.sessions[0].name).toBe('내 세션')
      expect(next.sessions[0].transmitStatus).toBe('pending')
      expect(next.sessions[0].endedAt).toBe(2000)
      expect(next.sessions[0].calls.map((c) => c.id)).toEqual(['a', 'c'])
    })

    it('keeps unselected calls in a fresh current session', () => {
      const next = splitAndArchive(recorded(['a', 'b', 'c']), ['a', 'c'], undefined, 2000)
      expect(next.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
      expect(next.currentSession!.sessionId).not.toBe('cur') // 새 세션 id
      expect(next.currentSession!.startedAt).toBe(2000)
      expect(next.currentSession!.url).toBe('https://x/page')
    })

    it('omits name when not provided', () => {
      const next = splitAndArchive(recorded(['a']), ['a'], undefined, 2000)
      expect(next.sessions[0].name).toBeUndefined()
    })

    it('returns the SAME state reference when nothing is selected (no-op contract)', () => {
      const state = recorded(['a', 'b'])
      expect(splitAndArchive(state, [], undefined, 2000)).toBe(state)
      expect(splitAndArchive(state, ['nope'], undefined, 2000)).toBe(state)
    })

    it('returns the SAME state reference when there is no current session', () => {
      expect(splitAndArchive(DEFAULT_STORAGE, ['a'], undefined, 2000)).toBe(DEFAULT_STORAGE)
    })

    it('selecting every call empties the new current session', () => {
      const next = splitAndArchive(recorded(['a', 'b']), ['a', 'b'], undefined, 2000)
      expect(next.sessions[0].calls).toHaveLength(2)
      expect(next.currentSession!.calls).toEqual([])
    })
  })
```

import에 `splitAndArchive` 추가.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/background/session-manager.test.ts`
Expected: FAIL — `splitAndArchive` export 없음

- [ ] **Step 3: 구현**

`src/background/session-manager.ts`의 `rotateSession` 아래에 추가:

```ts
// Cherry-pick rotation for manual send: archives ONLY the selected calls as a
// pending StoredSession (with an optional user-given name) and keeps the rest
// in a fresh current session. Returns the SAME state reference (===) when there
// is nothing to archive — callers rely on referential equality to detect a
// no-op, mirroring the appendCall contract.
export function splitAndArchive(
  state: StorageSchema,
  callIds: string[],
  name: string | undefined,
  now: number,
): StorageSchema {
  const current = state.currentSession
  if (!current) return state
  const ids = new Set(callIds)
  const selected = current.calls.filter((c) => ids.has(c.id))
  if (selected.length === 0) return state
  const remaining = current.calls.filter((c) => !ids.has(c.id))

  const archived: StoredSession = {
    sessionId: current.sessionId,
    ...(name !== undefined ? { name } : {}),
    url: current.url,
    startedAt: current.startedAt,
    endedAt: now,
    calls: selected,
    transmitStatus: 'pending',
  }

  return {
    ...state,
    sessions: [...state.sessions, archived],
    currentSession: { ...freshSession(current.url, now), calls: remaining },
  }
}
```

- [ ] **Step 4: 확인 후 커밋**

Run: `npx vitest run src/background/session-manager.test.ts && npx tsc --noEmit`
Expected: PASS (기존 14 + 신규 6)

```bash
git add src/background/session-manager.ts src/background/session-manager.test.ts
git commit -m "feat: splitAndArchive — 선택 호출만 아카이브하는 체리픽 분할"
```

---

### Task 4: sender 페이로드에 name 포함

**Files:**
- Modify: `src/background/sender.ts:42-48`
- Test: `src/background/sender.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/sender.test.ts`에 추가 (기존 픽스처 스타일에 맞춰 fetch mock 사용):

```ts
  it('includes the session name in the payload when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mcpServers: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const session: StoredSession = {
      sessionId: 's1', name: '결제 세션', url: 'https://x/a',
      startedAt: 1, endedAt: 2, calls: [], transmitStatus: 'pending',
    }
    await sendSession({ ...settingsFixture, serverUrl: 'https://c' } as Settings, session)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.name).toBe('결제 세션')
  })

  it('omits name from the payload when not set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mcpServers: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const session: StoredSession = {
      sessionId: 's1', url: 'https://x/a',
      startedAt: 1, endedAt: 2, calls: [], transmitStatus: 'pending',
    }
    await sendSession({ ...settingsFixture, serverUrl: 'https://c' } as Settings, session)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect('name' in body).toBe(false)
  })
```

주의: `sender.test.ts`의 기존 settings 픽스처 변수명을 확인해 맞출 것(위에서는 `settingsFixture`로 표기 — 실제 파일의 픽스처를 재사용). fetch mock 방식도 기존 테스트가 쓰는 패턴(`vi.stubGlobal` 또는 global 할당)을 그대로 따른다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/background/sender.test.ts`
Expected: FAIL — `body.name`이 undefined

- [ ] **Step 3: 구현**

`src/background/sender.ts`의 `body: JSON.stringify({...})`에 name 추가:

```ts
        body: JSON.stringify({
          sessionId: session.sessionId,
          name: session.name, // undefined면 JSON.stringify가 필드 자체를 생략
          url: session.url,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          calls: session.calls,
        }),
```

- [ ] **Step 4: 확인 후 커밋**

Run: `npx vitest run src/background/sender.test.ts && npx tsc --noEmit`
Expected: PASS

```bash
git add src/background/sender.ts src/background/sender.test.ts
git commit -m "feat: 전송 페이로드에 세션 name 포함 (additive)"
```

---

### Task 5: 백그라운드 핸들러 — SEND_CURRENT_SESSION · DELETE_CALL

**Files:**
- Modify: `src/background/index.ts:76-135` (handleMessage), 공통 헬퍼 추가
- Test: `src/background/index.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/index.test.ts`의 `describe('background message router')` 안에 추가:

```ts
  it('SEND_CURRENT_SESSION archives selected calls, sends them, keeps the rest', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a'), makeCall('b'), makeCall('c')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, name: '내 세션', callIds: ['a', 'c'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    // sender가 받은 세션은 선택분만 + 이름 포함
    const sentSession = sendImpl.mock.calls[0][1]
    expect(sentSession.calls.map((c: ApiCall) => c.id)).toEqual(['a', 'c'])
    expect(sentSession.name).toBe('내 세션')
    // 아카이브는 sent, 미선택분은 새 현재 세션에 잔류
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
    expect(next.state.currentSession!.sessionId).not.toBe('cur')
    expect(next.response).toEqual({ ok: true })
  })

  it('SEND_CURRENT_SESSION marks the archived session failed on sender failure', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: false, error: 'timeout' })
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['a'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(next.state.sessions[0].transmitStatus).toBe('failed')
    expect(next.state.sessions[0].calls).toHaveLength(1) // 데이터 보존
    expect(next.response).toEqual({ ok: false, error: 'timeout' })
  })

  it('SEND_CURRENT_SESSION with no matching calls responds with an error and does not send', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const sendImpl = vi.fn()
    const next = await handleMessage(
      state,
      { type: MSG.SEND_CURRENT_SESSION, callIds: ['nope'] },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).not.toHaveBeenCalled()
    expect(next.state).toBe(state)
    expect(next.response).toEqual({ ok: false, error: 'no calls selected' })
  })

  it('DELETE_CALL removes a single call from the current session', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a'), makeCall('b')], status: 'recording',
      },
    }
    const next = await handleMessage(
      state, { type: MSG.DELETE_CALL, callId: 'a' }, 'https://x/a', ctx,
    )
    expect(next.state.currentSession!.calls.map((c) => c.id)).toEqual(['b'])
  })

  it('DELETE_CALL with an unknown id is a no-op', async () => {
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: {
        sessionId: 'cur', url: 'https://x/a', startedAt: 1,
        calls: [makeCall('a')], status: 'recording',
      },
    }
    const next = await handleMessage(
      state, { type: MSG.DELETE_CALL, callId: 'zzz' }, 'https://x/a', ctx,
    )
    expect(next.state.currentSession!.calls).toHaveLength(1)
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: FAIL — 신규 케이스가 default 분기로 빠져 어설션 실패

- [ ] **Step 3: 구현 — 공통 헬퍼 추출 + 핸들러 추가**

`src/background/index.ts`에서 import에 `splitAndArchive` 추가:

```ts
import { appendCall, rotateSession, splitAndArchive, shouldAutoSend, IDLE_TIMEOUT_MS } from './session-manager'
```

`handleMessage` 위에 공통 헬퍼 추가 (SEND_SESSION·SEND_CURRENT_SESSION·autoSend가 공유하는 전송 결과 반영 로직 — 기존 중복 제거):

```ts
// Sends sessions[idx] and folds the result back into state: sent + mcpList
// merge on success, failed on error. Shared by SEND_SESSION,
// SEND_CURRENT_SESSION and the auto-send path.
async function sendArchivedAt(
  state: StorageSchema,
  idx: number,
  ctx: RouterCtx,
): Promise<RouterResult> {
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
```

`handleMessage`의 `API_CAPTURED` autoSend 분기를 헬퍼로 교체:

```ts
      // Auto-send: archive the full current session, then upload it.
      const archived = rotateSession(next, next.currentSession?.url ?? '', ctx.now())
      const { state: sent } = await sendArchivedAt(archived, archived.sessions.length - 1, ctx)
      return { state: sent }
```

`SEND_SESSION` 케이스를 헬퍼로 교체:

```ts
    case MSG.SEND_SESSION: {
      const idx = state.sessions.findIndex((s) => s.sessionId === msg.sessionId)
      if (idx === -1) return { state, response: { ok: false, error: 'session not found' } }
      return sendArchivedAt(state, idx, ctx)
    }
```

`SEND_SESSION` 케이스 아래에 신규 케이스 2개 추가:

```ts
    case MSG.SEND_CURRENT_SESSION: {
      // Cherry-pick manual send: archive ONLY the selected calls (with the
      // user-given name), keep the rest in a fresh current session, then send.
      const split = splitAndArchive(state, msg.callIds, msg.name, ctx.now())
      if (split === state) return { state, response: { ok: false, error: 'no calls selected' } }
      return sendArchivedAt(split, split.sessions.length - 1, ctx)
    }
    case MSG.DELETE_CALL: {
      const current = state.currentSession
      if (!current) return { state }
      const calls = current.calls.filter((c) => c.id !== msg.callId)
      if (calls.length === current.calls.length) return { state }
      return { state: { ...state, currentSession: { ...current, calls } } }
    }
```

- [ ] **Step 4: 확인 — 신규 + 기존 전체 (autoSend 리팩터 회귀 확인)**

Run: `npx vitest run src/background/index.test.ts && npx tsc --noEmit`
Expected: PASS (기존 20 + 신규 5 — autoSend 3종 케이스가 헬퍼 교체 후에도 통과해야 함)

- [ ] **Step 5: 커밋**

```bash
git add src/background/index.ts src/background/index.test.ts
git commit -m "feat: SEND_CURRENT_SESSION·DELETE_CALL 핸들러 — 수동 전송 session not found 수정"
```

---

### Task 6: 캡처 시점 URL 절대화 (BUG 2)

**Files:**
- Modify: `src/content/injected-capture.ts:68-101` (fetch), `:120-169` (XHR)
- Test: `src/content/injected-capture.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/content/injected-capture.test.ts`에 추가:

```ts
  it('resolves a relative fetch URL against the page URL', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const win = {
      fetch: fakeFetch,
      location: { href: 'https://x/page', origin: 'https://x' },
      postMessage: vi.fn(),
    } as unknown as Window & typeof globalThis

    installFetchPatch(win)
    const res = await win.fetch('/api/items')
    await res.text()

    const posted = (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
    expect(posted.call.url).toBe('https://x/api/items') // 상대경로 → 절대화
  })

  it('resolves a relative XHR URL against the page URL', async () => {
    const captured: Array<{ source: string; call: { url: string } }> = []
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
      xhr.open('GET', '/api/data')
      Object.defineProperty(xhr, 'status', { value: 200, configurable: true })
      Object.defineProperty(xhr, 'responseText', { value: '{}', configurable: true })
      Object.defineProperty(xhr, 'getAllResponseHeaders', {
        value: () => 'content-type: application/json\r\n',
        configurable: true,
      })
      xhr.send()
      xhr.dispatchEvent(new Event('loadend'))
    })

    expect(captured[0].call.url).toBe('https://x/api/data')
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/content/injected-capture.test.ts`
Expected: FAIL — url이 `/api/items`(원문 그대로)

- [ ] **Step 3: 구현**

`src/content/injected-capture.ts`의 `headersToObject` 위에 헬퍼 추가:

```ts
// Resolve relative URLs (the common SPA pattern: fetch('/api/x')) against the
// page URL at capture time, so downstream URL parsing — whitelist host match,
// dedupe path key, detail-view display — always sees an absolute URL.
function absolutize(url: string, win: Window): string {
  try {
    return new URL(url, win.location.href).href
  } catch {
    return url // malformed input: keep the raw string, capture stays best-effort
  }
}
```

`installFetchPatch`의 url 계산을 절대화로 감싼다:

```ts
    const url = absolutize(
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url,
      win,
    )
```

`installXhrPatch`의 `proto.open`에서 `__cap.url`을 절대화:

```ts
  proto.open = function (this: Tracked, method: string, url: string | URL, ...rest: unknown[]) {
    this.__cap = { url: absolutize(url.toString(), win), method, body: null, start: 0 }
    return origOpen.call(this, method, url, ...rest)
  }
```

- [ ] **Step 4: 확인 후 커밋**

Run: `npx vitest run src/content/injected-capture.test.ts && npx tsc --noEmit`
Expected: PASS (기존 4 + 신규 2)

```bash
git add src/content/injected-capture.ts src/content/injected-capture.test.ts
git commit -m "fix: 캡처 시점에 상대경로 URL 절대화 — 화이트리스트·dedupe·상세 표기 복구"
```

---

### Task 7: ListView — 체크박스 선택·전체 선택·개별 삭제

**Files:**
- Modify: `src/ui/sidepanel/ListView.tsx`
- Modify: `src/ui/theme/components.css` (클래스 추가)
- Test: `src/ui/sidepanel/ListView.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/ui/sidepanel/ListView.test.tsx`의 `base` 픽스처에 신규 필수 props 추가:

```ts
const base = {
  tracking: true, query: '', freshId: null, sending: false,
  excludedIds: new Set<string>(), selectedCount: 1,
  onToggleTracking: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
  onToggleExclude: vi.fn(), onToggleAll: vi.fn(), onDelete: vi.fn(),
  onClear: vi.fn(), onGoSend: vi.fn(), onClose: vi.fn(),
}
```

describe 블록에 테스트 추가:

```ts
  it('renders a checkbox per entry, checked when not excluded', () => {
    render(<ListView {...base} calls={[call()]} />)
    expect(screen.getByRole('checkbox', { name: '전송 대상' })).toBeChecked()
  })

  it('renders the checkbox unchecked when the call is excluded', () => {
    render(<ListView {...base} calls={[call()]} excludedIds={new Set(['c1'])} selectedCount={0} />)
    expect(screen.getByRole('checkbox', { name: '전송 대상' })).not.toBeChecked()
  })

  it('toggling a checkbox calls onToggleExclude with the call id', () => {
    const onToggleExclude = vi.fn()
    render(<ListView {...base} calls={[call()]} onToggleExclude={onToggleExclude} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '전송 대상' }))
    expect(onToggleExclude).toHaveBeenCalledWith('c1')
  })

  it('select-all checkbox calls onToggleAll', () => {
    const onToggleAll = vi.fn()
    render(<ListView {...base} calls={[call()]} onToggleAll={onToggleAll} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }))
    expect(onToggleAll).toHaveBeenCalled()
  })

  it('delete button calls onDelete with the call id', () => {
    const onDelete = vi.fn()
    render(<ListView {...base} calls={[call()]} onDelete={onDelete} />)
    fireEvent.click(screen.getByTitle('이 호출 삭제'))
    expect(onDelete).toHaveBeenCalledWith('c1')
  })

  it('footer send button shows the selected count and disables at zero', () => {
    const { rerender } = render(<ListView {...base} calls={[call()]} selectedCount={1} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    rerender(<ListView {...base} calls={[call()]} selectedCount={0} />)
    expect(screen.getByRole('button', { name: /서버로 전송/ })).toBeDisabled()
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/ui/sidepanel/ListView.test.tsx`
Expected: FAIL — checkbox/삭제 버튼 없음, props 타입 오류

- [ ] **Step 3: 구현**

`src/ui/sidepanel/ListView.tsx`의 props 인터페이스 확장:

```ts
interface ListViewProps {
  calls: ApiCall[]
  tracking: boolean
  query: string
  freshId: string | null
  sending: boolean
  excludedIds: Set<string> // 전송 제외로 표시된 호출 id (신규 도착은 자동 포함)
  selectedCount: number
  onToggleTracking: () => void
  onSearch: (q: string) => void
  onSelect: (id: string) => void
  onToggleExclude: (id: string) => void
  onToggleAll: () => void
  onDelete: (id: string) => void
  onClear: () => void
  onGoSend: () => void
  onClose: () => void
}
```

`searchrow` 바로 아래에 전체 선택 바 추가:

```tsx
      <div className="selbar">
        <label className="selbar-all">
          <input
            type="checkbox"
            aria-label="전체 선택"
            checked={calls.length > 0 && props.selectedCount === calls.length}
            onChange={props.onToggleAll}
            disabled={!calls.length}
          />
          전체 선택
        </label>
        <span className="selbar-count">{props.selectedCount}/{calls.length}건 전송 대상</span>
      </div>
```

entry 렌더링을 행 컨테이너로 감싼다 (체크박스·삭제 버튼은 `.entry` 버튼의 **형제** — 버튼 안에 인터랙티브 요소를 중첩하지 않는다):

```tsx
            {filtered.map((c) => (
              <div key={c.id} className="entry-row">
                <input
                  type="checkbox"
                  className="entry-check"
                  aria-label="전송 대상"
                  checked={!props.excludedIds.has(c.id)}
                  onChange={() => props.onToggleExclude(c.id)}
                />
                <button
                  className={'entry' + (c.id === freshId ? ' fresh' : '')}
                  onClick={() => props.onSelect(c.id)}
                >
                  <div className="entry-top">
                    <span className={'badge ' + c.method}>{c.method}</span>
                    <span className="path">{pathOf(c.url)}</span>
                    <span className={'status ' + statusClass(c.responseStatus)}>{c.responseStatus}</span>
                  </div>
                  <div className="entry-meta">
                    <span className="host">{hostOf(c.url)}</span>
                    <span className="sep">·</span>
                    <span>{c.durationMs}ms</span>
                    <span className="sep">·</span>
                    <span>{sizeOf(c.responseBody)}B</span>
                    <span style={{ marginLeft: 'auto' }}>{formatTime(c.capturedAt)}</span>
                  </div>
                  <span className="chev"><Chevron size={15} /></span>
                </button>
                <button
                  className="entry-del"
                  title="이 호출 삭제"
                  onClick={() => props.onDelete(c.id)}
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
```

푸터의 전송 버튼을 선택 건수 기준으로 변경:

```tsx
        <button className="btn btn-primary" disabled={!props.selectedCount || sending} onClick={props.onGoSend}>
          {sending ? '전송 중…' : <><Send size={16} /> 서버로 전송 <span className="pill">{props.selectedCount}</span></>}
        </button>
```

`src/ui/theme/components.css` 끝에 추가:

```css
/* --- 전송 대상 선택 (ListView) --- */
.selbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 14px; font-size: 11.5px; color: var(--text-3);
  border-bottom: 1px solid var(--border-soft);
}
.selbar-all { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.selbar-all input, .entry-check { accent-color: var(--accent); cursor: pointer; }
.entry-row { display: flex; align-items: stretch; gap: 6px; }
.entry-row .entry { flex: 1; min-width: 0; }
.entry-check { flex: none; align-self: center; }
.entry-del {
  flex: none; align-self: center; display: none;
  background: none; border: none; color: var(--text-3); cursor: pointer;
  padding: 4px; border-radius: 6px;
}
.entry-row:hover .entry-del { display: inline-flex; }
.entry-del:hover { color: var(--rec, #e5484d); background: var(--surface-2); }
```

- [ ] **Step 4: 확인 후 커밋**

Run: `npx vitest run src/ui/sidepanel/ListView.test.tsx && npx tsc --noEmit`
Expected: ListView 테스트 PASS. `tsc`는 이 시점에 `index.tsx`가 ListView에 신규 props를 아직 안 넘겨 **실패한다** — Task 9에서 해소되므로, 이 태스크에서는 vitest PASS만 확인하고 커밋은 Task 9와 묶지 않고 진행하되 커밋 메시지에 WIP 표기 대신 아래처럼 남긴다. (전체 tsc 게이트는 Task 9 완료 시점부터 강제)

```bash
git add src/ui/sidepanel/ListView.tsx src/ui/sidepanel/ListView.test.tsx src/ui/theme/components.css
git commit -m "feat: ListView 전송 대상 체크박스·전체 선택·개별 삭제 UI"
```

---

### Task 8: SendView — 세션 이름 입력·선택 건수·불확정 진행률

**Files:**
- Modify: `src/ui/sidepanel/SendView.tsx`
- Modify: `src/ui/theme/components.css`
- Test: `src/ui/sidepanel/SendView.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/ui/sidepanel/SendView.test.tsx` 전체를 신규 props 기준으로 갱신:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendView } from './SendView'
import type { ApiCall, Settings } from '../../shared/types'

const call = (m: string): ApiCall => ({
  id: m, url: 'https://x/a', method: m, requestHeaders: {}, requestBody: null,
  responseStatus: 200, responseHeaders: {}, responseBody: 'abc', durationMs: 1, capturedAt: 1,
})
const settings = { serverUrl: 'https://c/api' } as Settings
const base = {
  settings, sending: false, name: '', namePlaceholder: 'x · 7/28 세션',
  onName: vi.fn(), onSend: vi.fn(),
}

describe('SendView', () => {
  it('shows the selected count and the endpoint', () => {
    render(<SendView {...base} calls={[call('GET'), call('POST')]} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('https://c/api')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선택 2건 전송/ })).toBeInTheDocument()
  })

  it('disables the send button when there are no selected calls', () => {
    render(<SendView {...base} calls={[]} />)
    expect(screen.getByRole('button', { name: /선택 0건 전송/ })).toBeDisabled()
  })

  it('calls onSend on click', () => {
    const onSend = vi.fn()
    render(<SendView {...base} calls={[call('GET')]} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    expect(onSend).toHaveBeenCalled()
  })

  it('renders a session-name input with placeholder and forwards changes', () => {
    const onName = vi.fn()
    render(<SendView {...base} calls={[call('GET')]} onName={onName} />)
    const input = screen.getByPlaceholderText('x · 7/28 세션')
    fireEvent.change(input, { target: { value: '결제 API' } })
    expect(onName).toHaveBeenCalledWith('결제 API')
  })

  it('shows an indeterminate progress bar while sending', () => {
    render(<SendView {...base} calls={[call('GET')]} sending={true} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /업로드 중/ })).toBeDisabled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/ui/sidepanel/SendView.test.tsx`
Expected: FAIL — props 불일치, 입력 필드 없음

- [ ] **Step 3: 구현**

`src/ui/sidepanel/SendView.tsx`의 props를 교체(`progress` 제거):

```ts
interface SendViewProps {
  calls: ApiCall[] // 선택된(전송 대상) 호출만 전달된다
  settings: Settings
  sending: boolean
  name: string
  namePlaceholder: string
  onName: (v: string) => void
  onSend: () => void
}
```

함수 시그니처 갱신:

```tsx
export function SendView({ calls, settings, sending, name, namePlaceholder, onName, onSend }: SendViewProps): React.ReactElement {
```

"업로드 요약" set-group 위에 세션 이름 입력 추가:

```tsx
          <div className="set-group">
            <h3>세션 이름</h3>
            <input
              className="name-input"
              type="text"
              value={name}
              placeholder={namePlaceholder}
              onChange={(e) => onName(e.target.value)}
            />
          </div>
```

"수집 건수" 라벨을 "선택 건수"로 변경:

```tsx
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>선택 건수</div>
```

푸터를 불확정 진행률 + 선택 건수 라벨로 교체:

```tsx
      <div className="pfoot" style={{ flexDirection: 'column', gap: 9, alignItems: 'stretch' }}>
        {sending && <div className="progress-indet" role="progressbar" aria-label="업로드 진행 중" />}
        <button className="btn btn-primary" disabled={!calls.length || sending} onClick={onSend} style={{ height: 44 }}>
          {sending ? '업로드 중…' : <><Send size={16} /> 선택 {calls.length}건 전송</>}
        </button>
      </div>
```

`src/ui/theme/components.css` 끝에 추가:

```css
/* --- SendView: 세션 이름 입력 · 불확정 진행률 --- */
.name-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--surface); border: 1px solid var(--border-soft);
  border-radius: 8px; color: var(--text-1, inherit); font-size: 12.5px;
}
.name-input::placeholder { color: var(--text-3); }
.progress-indet {
  height: 5px; border-radius: 5px; background: var(--surface-2); overflow: hidden;
}
.progress-indet::after {
  content: ''; display: block; height: 100%; width: 40%;
  background: var(--accent); border-radius: 5px;
  animation: indet-slide 1.1s ease-in-out infinite;
}
@keyframes indet-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
```

- [ ] **Step 4: 확인 후 커밋**

Run: `npx vitest run src/ui/sidepanel/SendView.test.tsx`
Expected: PASS (5 tests). (`tsc`는 index.tsx 배선 전까지 실패 — Task 9에서 해소)

```bash
git add src/ui/sidepanel/SendView.tsx src/ui/sidepanel/SendView.test.tsx src/ui/theme/components.css
git commit -m "feat: SendView 세션 이름 입력·선택 건수 라벨·불확정 진행률"
```

---

### Task 9: 사이드패널 배선 — excludedIds·SEND_CURRENT_SESSION·토스트 아이콘

**Files:**
- Modify: `src/ui/sidepanel/index.tsx`
- Modify: `src/ui/sidepanel/icons.tsx` (X 아이콘 추가)
- Test: `src/ui/sidepanel/index.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/ui/sidepanel/index.test.tsx`에 추가:

```tsx
  it('sends SEND_CURRENT_SESSION with the selected callIds and name', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: '전송' })) // Rail → Send 뷰
    fireEvent.change(screen.getByPlaceholderText(/세션/), { target: { value: '내 세션' } })
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MSG.SEND_CURRENT_SESSION, name: '내 세션', callIds: ['c1'],
      }),
    )
  })

  it('omits name when the input is blank', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: '전송' }))
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MSG.SEND_CURRENT_SESSION, name: undefined, callIds: ['c1'],
      }),
    )
  })

  it('excluding a call via its checkbox removes it from the send payload', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('checkbox', { name: '전송 대상' })) // c1 제외
    // 선택 0건 → List 푸터 전송 버튼 비활성
    expect(screen.getByRole('button', { name: /서버로 전송/ })).toBeDisabled()
  })

  it('sends DELETE_CALL when the row delete button is clicked', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByTitle('이 호출 삭제'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.DELETE_CALL, callId: 'c1' })
  })

  it('failure toast does not carry the ok class (and success does)', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'timeout' })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: '전송' }))
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    const toast = await screen.findByText(/전송 실패/)
    expect(toast.closest('.toast')!.className).not.toContain('ok')
    expect(screen.getByTestId('toast-icon-err')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/ui/sidepanel/index.test.tsx`
Expected: FAIL — 체크박스/삭제 버튼 미배선, SEND_SESSION 구 메시지 전송

- [ ] **Step 3: 구현**

`src/ui/sidepanel/icons.tsx` 끝에 X 아이콘 추가:

```tsx
export const X = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Svg>
)
```

`src/ui/sidepanel/index.tsx` 수정:

import 갱신:

```tsx
import { hostOf } from './view-utils'
import { Check, X } from './icons'
```

`Panel` 컴포넌트에 상태 추가 (기존 `sending` 아래):

```tsx
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [sessionName, setSessionName] = useState('')
```

`calls` 계산 아래에 파생값 추가:

```tsx
  const selectedCalls = calls.filter((c) => !excludedIds.has(c.id))
  const now = new Date()
  const namePlaceholder = `${hostOf(session?.url ?? '') || '세션'} · ${now.getMonth() + 1}/${now.getDate()} 세션`
```

핸들러 추가/교체 (`onClear` 아래):

```tsx
  const onToggleExclude = (id: string): void => {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const onToggleAll = (): void => {
    setExcludedIds((prev) =>
      prev.size === 0 && calls.length > 0 ? new Set(calls.map((c) => c.id)) : new Set(),
    )
  }
  const onDelete = (id: string): void => {
    void chrome.runtime.sendMessage({ type: MSG.DELETE_CALL, callId: id })
    setExcludedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }
```

`onSend`를 교체 (BUG 1 수정의 UI 절반):

```tsx
  const onSend = (): void => {
    if (!selectedCalls.length || sending) return
    setSending(true)
    const n = selectedCalls.length
    void (chrome.runtime.sendMessage({
      type: MSG.SEND_CURRENT_SESSION,
      name: sessionName.trim() || undefined,
      callIds: selectedCalls.map((c) => c.id),
    }) as Promise<SendSessionResponse>)
      .then((res) => {
        flash(res?.ok ? `${n}건을 서버로 전송했습니다` : `전송 실패: ${res?.error ?? '알 수 없는 오류'}`, !!res?.ok)
        if (res?.ok) {
          setExcludedIds(new Set()) // 전송 후 잔류분은 전량 선택 상태로 초기화
          setSessionName('')
        }
      })
      .finally(() => setSending(false))
  }
```

`onToggleAll`의 전체 선택 판정은 "제외가 하나도 없으면 전체 해제, 있으면 전체 선택"이다.
ListView의 전체 선택 체크박스 판정(`selectedCount === calls.length`)과 의미가 일치한다.

SendView 렌더링 교체:

```tsx
  } else if (view === 'send') {
    content = (
      <SendView
        calls={selectedCalls}
        settings={settings}
        sending={sending}
        name={sessionName}
        namePlaceholder={namePlaceholder}
        onName={setSessionName}
        onSend={onSend}
      />
    )
  }
```

ListView 렌더링에 신규 props 전달:

```tsx
      <ListView
        calls={calls}
        tracking={settings.trackingEnabled}
        query={query}
        freshId={freshId}
        sending={sending}
        excludedIds={excludedIds}
        selectedCount={selectedCalls.length}
        onToggleTracking={onToggleTracking}
        onSearch={setQuery}
        onSelect={onSelect}
        onToggleExclude={onToggleExclude}
        onToggleAll={onToggleAll}
        onDelete={onDelete}
        onClear={onClear}
        onGoSend={() => setView('send')}
        onClose={() => window.close()}
      />
```

토스트 아이콘 분기:

```tsx
      {toast && (
        <div className={'toast' + (toast.ok ? ' ok' : '')}>
          <span className="ic" data-testid={toast.ok ? 'toast-icon-ok' : 'toast-icon-err'}>
            {toast.ok ? <Check size={15} /> : <X size={15} />}
          </span>
          {toast.msg}
        </div>
      )}
```

- [ ] **Step 4: 전체 확인 — 이 시점부터 tsc 게이트 정상화**

Run: `npm run test:run && npx tsc --noEmit`
Expected: 전체 PASS (기존 132 + 신규 ~25)

- [ ] **Step 5: 커밋**

```bash
git add src/ui/sidepanel/index.tsx src/ui/sidepanel/index.test.tsx src/ui/sidepanel/icons.tsx
git commit -m "feat: 사이드패널 체리픽 전송 배선 — 선택/삭제/세션 이름/토스트 아이콘"
```

---

### Task 10: 전체 검증 — 빌드 + E2E 재검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 정적 게이트**

Run: `npm run test:run && npm run build`
Expected: 전체 테스트 PASS, `dist/` 산출

- [ ] **Step 2: E2E 재검증 (agent-browser + 목 서버)**

브레인스토밍 단계에서 쓴 목 서버를 재사용한다(scratchpad의 `mock-server.mjs` — `POST /api/sessions` 수신 기록, `GET /received` 조회 제공, 테스트 페이지에 상대경로 fetch/XHR 버튼).

```bash
node <scratchpad>/mock-server.mjs &   # http://localhost:8787
agent-browser --extension <repo>/dist --headed open http://localhost:8787/
```

검증 시나리오 (각 항목을 스냅샷/스토리지 eval로 확인):

1. **BUG 2 수정 확인**: Settings 화이트리스트에 `localhost` 입력 → 테스트 페이지에서 상대경로 `fetch('/api/users')` → **캡처됨** (수정 전에는 드롭)
2. **Detail 표기**: 상세 뷰 URL이 `http://localhost:8787/api/users`로 정상 표기 (수정 전 `https:///api/users`)
3. **체리픽 전송 (BUG 1 수정 확인)**: 4건 캡처 → 1건 체크 해제 → Send 뷰에서 이름 "E2E 세션" 입력 → `선택 3건 전송` 클릭 → 성공 토스트
4. **서버 수신 검증**: `curl localhost:8787/received` → `calls` 3건 + `name: "E2E 세션"` 포함
5. **잔류 확인**: List에 체크 해제했던 1건만 남고, 새 세션으로 재시작됨 (storage eval: `sessions[0].transmitStatus === 'sent'`, `currentSession.calls.length === 1`)
6. **개별 삭제**: 남은 1건의 삭제 버튼 클릭 → List 비워짐

- [ ] **Step 3: 이슈 발견 시 수정 후 재검증, 완료 시 정리**

브라우저/목 서버 종료. 발견된 이슈는 해당 태스크로 돌아가 수정 커밋.

---

### Task 11: Handoff 사용 문서 작성

**Files:**
- Create: `docs/handoff/2026-07-28-extension-usage.md`
- Create: `docs/handoff/images/*.png` (Task 10의 E2E 세션에서 캡처)

- [ ] **Step 1: Task 10의 E2E 세션 중 스크린샷 캡처**

agent-browser `screenshot` 명령으로 다음 4장을 `docs/handoff/images/`에 저장:

| 파일 | 장면 |
|---|---|
| `01-widget.png` | 페이지 위 플로팅 위젯 (추적 중, 배지 카운트) |
| `02-list-checkbox.png` | 사이드패널 List — 체크박스·전체 선택 바·개별 삭제 버튼 |
| `03-send-name.png` | Send 뷰 — 세션 이름 입력·선택 건수·전송 버튼 |
| `04-settings.png` | Settings — 서버 URL/API Key/화이트리스트 |

- [ ] **Step 2: 문서 작성**

`docs/handoff/2026-07-28-extension-usage.md` — 핵심만 간략히, 아래 구성:

```markdown
# API-to-MCP Tracker 사용 가이드 (Handoff)

## 1. 설치 — 빌드 & 로드
(npm install / npm run build / chrome://extensions Load unpacked dist/)

## 2. 캡처 시작·중지
(위젯 hover → 추적 토글, 배지 = 수집 건수, 위젯 클릭 = 패널 열기)
![위젯](images/01-widget.png)

## 3. 수집 목록 확인·필터링
(List 뷰: 검색, 체크박스 = 전송 대상 선택, hover 삭제 버튼, 전체 선택/해제)
![List](images/02-list-checkbox.png)

## 4. 세션 이름 지정 & 전송
(Send 뷰: 이름 입력(선택) → 선택 N건 전송 → 성공 시 선택분은 히스토리로,
미선택분은 새 세션에 잔류)
![Send](images/03-send-name.png)

## 5. 설정
(서버 URL/API Key — 입력 즉시 자동 저장, 도메인 화이트/블랙리스트,
메서드 필터, 응답 본문 저장/autoSend/dedupe 토글)
![Settings](images/04-settings.png)

## 6. 서버 계약 (참고)
POST {serverUrl}/api/sessions
Authorization: Bearer {apiKey}
{ sessionId, name?, url, startedAt, endedAt, calls: ApiCall[] }
→ 응답 { mcpServers: McpEntry[] } 가 MCP 목록에 병합됨

## 7. 알려진 제약
(패치 이전의 초기 로드 호출은 미캡처, 재전송 UI 미구현(히스토리 뷰 disabled),
세션은 30분 idle 또는 추적 토글로만 자동 경계)
```

각 절은 2-4문장 + 스크린샷. 상세 개발 정보는 README로 링크하고 중복 서술하지 않는다.

- [ ] **Step 3: 커밋**

```bash
git add docs/handoff/
git commit -m "docs: 확장 사용 가이드 handoff 문서 추가 (스크린샷 포함)"
```

---

## Self-Review 결과

- **스펙 커버리지**: 스펙 §1(types/messages)→Task 1·2, §2(splitAndArchive)→Task 3, §3(라우터)→Task 5, §4(절대화)→Task 6, §5(UI)→Task 7·8·9, §6(엣지)→Task 3·5 테스트, §7(테스트)→각 태스크, §8(handoff)→Task 11. 누락 없음.
- **플레이스홀더**: 없음 — 모든 코드 스텝에 실제 코드 포함. (Task 4의 픽스처 변수명만 실제 파일 확인 후 맞추도록 명시)
- **타입 일관성**: `splitAndArchive(state, callIds, name, now)` — Task 3 정의 = Task 5 사용. `SendCurrentSessionMessage{name?, callIds}` — Task 1 = Task 5 = Task 9. `excludedIds/selectedCount/onToggleExclude/onToggleAll/onDelete` — Task 7 정의 = Task 9 전달. 일치 확인.
- **알려진 순서 의존**: Task 7·8 커밋 시점에는 `index.tsx` 미배선으로 `tsc` 전체 게이트가 일시적으로 깨진다(테스트는 통과). Task 9에서 해소 — 각 태스크에 명시했다.
