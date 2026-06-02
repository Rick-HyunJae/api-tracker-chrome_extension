# API Collector P3 — 캡처 설정 실동작 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자인 SettingsView가 노출하는 캡처 설정(메서드 필터·도메인 화이트리스트·본문 저장·중복 제외·자동 전송)을 서비스워커 캡처 파이프라인에서 **실제로 동작**하게 만든다.

**Architecture:** 필터링은 순수 함수 `appendCall`(`session-manager.ts`) 한 곳에 모은다 — 메서드/화이트리스트 미통과 시 state를 그대로 반환(드롭), `saveBody` off면 `responseBody` strip, `dedupe` on이면 동일 path 교체. 자동 전송은 `handleMessage`(`index.ts`)의 `API_CAPTURED` 분기에서 임계(50건) 도달 시 현재 세션을 아카이브→전송한다. 설정 신규 필드는 `Settings` 타입에 추가하고 `getStorage`의 기존 디폴트 머지가 마이그레이션을 담당한다.

**Tech Stack:** TypeScript, Vitest, Chrome MV3 SW.

**Spec:** `docs/specs/2026-06-01-api-collector-design-application-design.md` (§3.3)

**의존:** P1·P2와 독립적으로 구현·테스트 가능. (P2 SettingsView가 이 필드들을 storage에 쓰면 즉시 연동된다.)

---

## File Structure

- Modify: `src/shared/types.ts` — `Settings`에 5개 필드 + `DEFAULT_SETTINGS` 기본값.
- Create: `src/shared/domain-match.ts` — 화이트리스트 glob 매처(순수).
- Create: `src/shared/domain-match.test.ts`
- Modify: `src/background/session-manager.ts` — `appendCall` 시그니처+필터, `AUTO_SEND_THRESHOLD`, `shouldAutoSend`.
- Modify: `src/background/session-manager.test.ts` — 기존 `appendCall` 호출에 settings 인자 추가 + 필터 테스트.
- Modify: `src/background/index.ts` — `API_CAPTURED` 분기에서 settings 전달 + autoSend 오케스트레이션.
- Modify: `src/background/index.test.ts` — autoSend 테스트.

---

## Task 1: Settings 타입 확장 + 기본값 (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Test: `src/shared/types.test.ts` (기존 파일에 추가)

- [ ] **Step 1: 실패 테스트 추가**

`src/shared/types.test.ts`에 추가 (없으면 신규 생성, 아래 import 포함):

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from './types'

describe('DEFAULT_SETTINGS capture fields', () => {
  it('captures all five HTTP methods by default', () => {
    expect(DEFAULT_SETTINGS.captureMethods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  })
  it('has an empty domain whitelist by default (capture everything)', () => {
    expect(DEFAULT_SETTINGS.domainWhitelist).toEqual([])
  })
  it('saves response bodies by default', () => {
    expect(DEFAULT_SETTINGS.saveBody).toBe(true)
  })
  it('disables auto-send and dedupe by default', () => {
    expect(DEFAULT_SETTINGS.autoSend).toBe(false)
    expect(DEFAULT_SETTINGS.dedupe).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/shared/types.test.ts`
Expected: FAIL — 신규 필드 미정의

- [ ] **Step 3: 타입·기본값 추가**

`src/shared/types.ts`의 `Settings` 인터페이스에 필드 추가 (`consentGivenAt` 위에):

```ts
  domainWhitelist: string[]
  captureMethods: string[]
  saveBody: boolean
  autoSend: boolean
  dedupe: boolean
```

`DEFAULT_SETTINGS` 갱신:

```ts
export const DEFAULT_SETTINGS: Settings = {
  serverUrl: '',
  apiKey: '',
  trackingEnabled: true,
  blacklistedDomains: [],
  domainWhitelist: [],
  captureMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  saveBody: true,
  autoSend: false,
  dedupe: false,
}
```

> 마이그레이션: `getStorage`가 이미 `{ ...DEFAULT_STORAGE.settings, ...raw.settings }`로 머지하므로, 기존 사용자 저장값에 신규 필드가 없으면 자동으로 기본값이 채워진다. 별도 마이그레이션 코드 불필요.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/shared/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat(settings): add capture-filter settings fields with defaults"
```

---

## Task 2: 도메인 화이트리스트 매처 (TDD)

**Files:**
- Create: `src/shared/domain-match.ts`
- Test: `src/shared/domain-match.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/shared/domain-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchDomain } from './domain-match'

describe('matchDomain', () => {
  it('matches a subdomain against a *. wildcard', () => {
    expect(matchDomain('api.shopmall.io', '*.shopmall.io')).toBe(true)
  })
  it('matches the bare apex against a *. wildcard', () => {
    expect(matchDomain('shopmall.io', '*.shopmall.io')).toBe(true)
  })
  it('rejects an unrelated host against a *. wildcard', () => {
    expect(matchDomain('evil.com', '*.shopmall.io')).toBe(false)
  })
  it('matches an exact host', () => {
    expect(matchDomain('example.com', 'example.com')).toBe(true)
  })
  it('rejects a subdomain against an exact (non-wildcard) host', () => {
    expect(matchDomain('x.example.com', 'example.com')).toBe(false)
  })
  it('rejects an empty pattern', () => {
    expect(matchDomain('example.com', '')).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/shared/domain-match.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/shared/domain-match.ts`:

```ts
// Match a host against a whitelist pattern. Supports a leading "*." wildcard
// (matches the apex and any subdomain) or an exact host string.
export function matchDomain(host: string, pattern: string): boolean {
  if (!pattern) return false
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2)
    return host === base || host.endsWith('.' + base)
  }
  return host === pattern
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/shared/domain-match.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain-match.ts src/shared/domain-match.test.ts
git commit -m "feat(settings): add domain whitelist matcher"
```

---

## Task 3: appendCall 필터링 (TDD)

**Files:**
- Modify: `src/background/session-manager.ts`
- Modify: `src/background/session-manager.test.ts`

### 3a. 기존 호출부 시그니처 갱신

- [ ] **Step 1: 기존 테스트의 appendCall 호출에 settings 추가**

`src/background/session-manager.test.ts` 상단 import에 `DEFAULT_SETTINGS` 추가:

```ts
import { DEFAULT_STORAGE, DEFAULT_SETTINGS } from '../shared/types'
```

기존 4개 호출을 4-인자로 변경:

```ts
const next = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000, DEFAULT_SETTINGS)
// ...
const s1 = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000, DEFAULT_SETTINGS)
const s2 = appendCall(s1, makeCall('c2'), 1100, DEFAULT_SETTINGS)
// ...
const recording = appendCall(DEFAULT_STORAGE, makeCall('c1'), 1000, DEFAULT_SETTINGS)
```

### 3b. 필터 테스트 추가

- [ ] **Step 2: 필터 실패 테스트 추가**

`src/background/session-manager.test.ts`의 `describe` 끝에 추가 (헬퍼 `makeCall`을 method/url 지정 가능하게 확장한 버전 사용):

```ts
  function call(over: Partial<ApiCall & { pageUrl: string }>): ApiCall & { pageUrl: string } {
    return { ...makeCall('cX'), ...over }
  }

  it('drops a call whose method is not in captureMethods', () => {
    const settings = { ...DEFAULT_SETTINGS, captureMethods: ['POST'] }
    const next = appendCall(DEFAULT_STORAGE, call({ method: 'GET' }), 1, settings)
    expect(next.currentSession?.calls ?? []).toHaveLength(0)
  })

  it('drops a call whose host is outside a non-empty whitelist', () => {
    const settings = { ...DEFAULT_SETTINGS, domainWhitelist: ['*.allowed.io'] }
    const next = appendCall(DEFAULT_STORAGE, call({ url: 'https://evil.com/api' }), 1, settings)
    expect(next.currentSession?.calls ?? []).toHaveLength(0)
  })

  it('keeps a whitelisted host', () => {
    const settings = { ...DEFAULT_SETTINGS, domainWhitelist: ['*.allowed.io'] }
    const next = appendCall(DEFAULT_STORAGE, call({ url: 'https://api.allowed.io/x' }), 1, settings)
    expect(next.currentSession!.calls).toHaveLength(1)
  })

  it('strips the response body when saveBody is off', () => {
    const settings = { ...DEFAULT_SETTINGS, saveBody: false }
    const next = appendCall(DEFAULT_STORAGE, call({ responseBody: '{"a":1}' }), 1, settings)
    expect(next.currentSession!.calls[0].responseBody).toBeNull()
  })

  it('dedupes by path, keeping the latest response', () => {
    const settings = { ...DEFAULT_SETTINGS, dedupe: true }
    const s1 = appendCall(DEFAULT_STORAGE, call({ id: 'a', url: 'https://x/api/users', responseStatus: 200 }), 1, settings)
    const s2 = appendCall(s1, call({ id: 'b', url: 'https://x/api/users?page=2', responseStatus: 500 }), 2, settings)
    expect(s2.currentSession!.calls).toHaveLength(1)
    expect(s2.currentSession!.calls[0].id).toBe('b')
  })
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/background/session-manager.test.ts`
Expected: FAIL — `appendCall`이 아직 4번째 인자/필터를 처리하지 않음 (타입 에러 또는 단언 실패)

- [ ] **Step 4: appendCall 구현 교체**

`src/background/session-manager.ts` 상단 import에 추가:

```ts
import type { ApiCall, CurrentSession, Settings, StorageSchema, StoredSession } from '../shared/types'
import { matchDomain } from '../shared/domain-match'
```

`appendCall`을 교체:

```ts
function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export function appendCall(
  state: StorageSchema,
  call: ApiCall & { pageUrl: string },
  now: number,
  settings: Settings,
): StorageSchema {
  // Method filter
  if (!settings.captureMethods.includes(call.method)) return state

  // Domain whitelist (only when non-empty)
  if (settings.domainWhitelist.length > 0) {
    let host = ''
    try {
      host = new URL(call.url).host
    } catch {
      host = ''
    }
    const allowed = host !== '' && settings.domainWhitelist.some((p) => matchDomain(host, p))
    if (!allowed) return state
  }

  const stored = settings.saveBody ? call : { ...call, responseBody: null }
  const current = state.currentSession ?? freshSession(call.pageUrl, now)

  const base = settings.dedupe
    ? current.calls.filter((c) => safePath(c.url) !== safePath(call.url))
    : current.calls

  return {
    ...state,
    currentSession: {
      ...current,
      status: 'recording',
      calls: [...base, stored],
    },
  }
}
```

> 기존 `appendCall`의 `pageOrigin`/`void pageOrigin` 주석 라인은 삭제한다(미사용). `freshSession`은 동일 파일에 이미 존재한다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/background/session-manager.test.ts`
Expected: PASS (기존 + 신규 필터 테스트)

- [ ] **Step 6: Commit**

```bash
git add src/background/session-manager.ts src/background/session-manager.test.ts
git commit -m "feat(capture): method/whitelist/saveBody/dedupe filters in appendCall"
```

---

## Task 4: 자동 전송 (TDD)

**Files:**
- Modify: `src/background/session-manager.ts` — `AUTO_SEND_THRESHOLD`, `shouldAutoSend`.
- Modify: `src/background/index.ts` — `API_CAPTURED` 분기.
- Modify: `src/background/index.test.ts` — autoSend 테스트.

### 4a. 임계 술어 (TDD)

- [ ] **Step 1: 실패 테스트 추가**

`src/background/session-manager.test.ts`에 추가:

```ts
  it('shouldAutoSend is true only when autoSend is on and threshold reached', () => {
    const calls = Array.from({ length: AUTO_SEND_THRESHOLD }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    expect(shouldAutoSend(state, { ...DEFAULT_SETTINGS, autoSend: true })).toBe(true)
    expect(shouldAutoSend(state, { ...DEFAULT_SETTINGS, autoSend: false })).toBe(false)
  })

  it('shouldAutoSend is false below the threshold', () => {
    const calls = Array.from({ length: AUTO_SEND_THRESHOLD - 1 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    expect(shouldAutoSend(state, { ...DEFAULT_SETTINGS, autoSend: true })).toBe(false)
  })
```

import 갱신:

```ts
import { startSession, appendCall, rotateSession, shouldAutoSend, AUTO_SEND_THRESHOLD, IDLE_TIMEOUT_MS } from './session-manager'
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/background/session-manager.test.ts`
Expected: FAIL — `shouldAutoSend`/`AUTO_SEND_THRESHOLD` 미정의

- [ ] **Step 3: 구현 추가**

`src/background/session-manager.ts`에 추가:

```ts
export const AUTO_SEND_THRESHOLD = 50

export function shouldAutoSend(state: StorageSchema, settings: Settings): boolean {
  return settings.autoSend && (state.currentSession?.calls.length ?? 0) >= AUTO_SEND_THRESHOLD
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/background/session-manager.test.ts`
Expected: PASS

### 4b. handleMessage 오케스트레이션

- [ ] **Step 5: autoSend 실패 테스트 추가**

> 전제(현 파일 확인): `src/background/index.test.ts`에 `makeCall`(line 7)·`ctx`(line 22, `{ now }` 포함)·`DEFAULT_STORAGE`/`StorageSchema` import가 이미 존재한다. 아래 테스트는 이 헬퍼들을 재사용한다.

`src/background/index.test.ts`의 라우터 `describe`에 추가:

```ts
  it('auto-sends and archives the session when autoSend threshold is hit', async () => {
    const calls = Array.from({ length: 49 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, autoSend: true },
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('c49') },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).toHaveBeenCalledOnce()
    expect(next.state.sessions).toHaveLength(1)
    expect(next.state.sessions[0].transmitStatus).toBe('sent')
    expect(next.state.currentSession!.calls).toHaveLength(0)
  })

  it('does not auto-send below the threshold', async () => {
    const calls = Array.from({ length: 10 }, (_, i) => makeCall('c' + i))
    const state: StorageSchema = {
      ...DEFAULT_STORAGE,
      settings: { ...DEFAULT_STORAGE.settings, autoSend: true },
      currentSession: { sessionId: 's', url: 'https://x/a', startedAt: 1, calls, status: 'recording' },
    }
    const sendImpl = vi.fn().mockResolvedValue({ ok: true, mcpServers: [] })
    const next = await handleMessage(
      state,
      { type: MSG.API_CAPTURED, payload: makeCall('c10') },
      'https://x/a',
      { ...ctx, sendSession: sendImpl },
    )
    expect(sendImpl).not.toHaveBeenCalled()
    expect(next.state.currentSession!.calls).toHaveLength(11)
  })
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: FAIL — 현재 분기는 settings 미전달·autoSend 미처리

- [ ] **Step 7: index.ts 갱신**

`src/background/index.ts` import 갱신:

```ts
import { appendCall, rotateSession, shouldAutoSend, IDLE_TIMEOUT_MS } from './session-manager'
```

`API_CAPTURED` 분기 교체 (기존 88행 부근):

```ts
    case MSG.API_CAPTURED: {
      // MVP: consent gate removed. Capture is gated by trackingEnabled only.
      if (!state.settings.trackingEnabled) return { state }
      const next = appendCall(state, msg.payload, ctx.now(), state.settings)
      if (next === state) return { state } // dropped by a capture filter
      if (!shouldAutoSend(next, state.settings)) return { state: next }

      // Auto-send: archive the full current session, then upload it.
      const archived = rotateSession(next, next.currentSession?.url ?? '', ctx.now())
      const idx = archived.sessions.length - 1
      const send = ctx.sendSession ?? defaultSendSession
      const result = await send(archived.settings, archived.sessions[idx])
      const sessions = archived.sessions.slice()
      if (result.ok) {
        sessions[idx] = { ...sessions[idx], transmitStatus: 'sent', sentAt: ctx.now() }
        const mcpList = mergeMcpList(archived.mcpList, result.mcpServers ?? [])
        return { state: { ...archived, sessions, mcpList } }
      }
      sessions[idx] = { ...sessions[idx], transmitStatus: 'failed' }
      return { state: { ...archived, sessions } }
    }
```

> `rotateSession`은 calls가 1건 이상일 때만 아카이브하므로 임계(50)에서 항상 아카이브된다. `defaultSendSession`·`mergeMcpList`는 파일 상단에 이미 import되어 있다.
>
> **실패 재시도 시맨틱:** autoSend 전송이 실패하면 해당 세션은 `transmitStatus:'failed'`로 `sessions[]`에 남고 현재 세션은 이미 비워진 채 회전된다. 실패분은 자동 재시도하지 않으며, 사용자가 전송 뷰에서 수동 `SEND_SESSION`으로 재전송한다(기존 SEND_SESSION 경로 재사용). 자동 재시도 큐는 본 plan 범위 밖(후속).

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run src/background/index.test.ts`
Expected: PASS (기존 + autoSend 2개)

- [ ] **Step 9: Commit**

```bash
git add src/background/session-manager.ts src/background/index.ts src/background/index.test.ts
git commit -m "feat(capture): auto-send session on threshold"
```

---

## Task 5: P3 통합 검증

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 2: 타입체크 + lint**

Run: `npx tsc --noEmit && npx eslint src/background src/shared`
Expected: PASS, 경고 없음

---

## Self-Review (작성자 체크)

- **Spec 커버리지(§3.3):** captureMethods 필터 ✓ / domainWhitelist 필터 ✓ / saveBody strip ✓ / dedupe ✓ / autoSend ✓ / Settings 확장+마이그레이션 ✓.
- **Placeholder 스캔:** 모든 스텝에 실제 코드/명령. 추상 지시 없음.
- **타입 일관성:** `appendCall(state, call, now, settings)` — Task3 정의 ↔ index.ts(Task4) 호출 ↔ 테스트(Task3) 인자 일치. `shouldAutoSend(state, settings)`/`AUTO_SEND_THRESHOLD` — 정의(Task4a) ↔ 사용(Task4b) 일치. `matchDomain(host, pattern)` — Task2 정의 ↔ Task3 사용 일치. 신규 `Settings` 필드명(`domainWhitelist`/`captureMethods`/`saveBody`/`autoSend`/`dedupe`)이 전 태스크 일관.
- **회귀:** 기존 `appendCall` 3-인자 호출 4곳을 4-인자로 갱신(Task3 Step1). 기존 API_CAPTURED 라우터 테스트는 permissive 기본값으로 그대로 통과.

---

## 다음 단계
- P1·P2 plan과 합쳐 spec 전체 구현 완료. 통합은 각 단계 격리 워크트리 → `superpowers:finishing-a-development-branch` squash.
