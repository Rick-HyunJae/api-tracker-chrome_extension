import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getStorage, onStorageChanged, patchStorage } from '../../shared/storage'
import { MSG } from '../../shared/messages'
import type { SendSessionResponse } from '../../shared/messages'
import type { ApiCall, CurrentSession, Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { connectSidePanelPort } from './port'
import { Rail } from './Rail'
import type { RailView } from './Rail'
import { ListView } from './ListView'
import { DetailView } from './DetailView'
import { SettingsView } from './SettingsView'
import { Check, X } from './icons'
import '../theme/components.css'

type View = RailView | 'detail'

export function Panel(): React.ReactElement {
  const [session, setSession] = useState<CurrentSession | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [freshId, setFreshId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const prevIds = useRef<Set<string>>(new Set())

  const flash = (msg: string, ok = true): void => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2200)
  }

  useEffect(() => {
    void getStorage().then((s) => {
      prevIds.current = new Set((s.currentSession?.calls ?? []).map((c) => c.id))
      setSession(s.currentSession)
      setSettings(s.settings)
    })
    onStorageChanged((changes) => {
      if (changes.currentSession) {
        const next = changes.currentSession.newValue as CurrentSession | null
        const nextCalls = next?.calls ?? []
        const added = nextCalls.find((c) => !prevIds.current.has(c.id))
        prevIds.current = new Set(nextCalls.map((c) => c.id))
        if (added) {
          setFreshId(added.id)
          setTimeout(() => setFreshId((id) => (id === added.id ? null : id)), 1500)
        }
        setSession(next)
      }
      if (changes.settings) setSettings(changes.settings.newValue as Settings)
    })
    void connectSidePanelPort()
  }, [])

  const calls: ApiCall[] = session?.calls ?? []
  const selected = calls.find((c) => c.id === selectedId) ?? null
  const selectedCalls = calls.filter((c) => !excludedIds.has(c.id))

  const onToggleTracking = (): void => {
    void chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: !settings.trackingEnabled })
  }
  const onChangeSettings = (patch: Partial<Settings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void patchStorage({ settings: next })
  }
  const onClear = (): void => {
    if (!session) return
    setSelectedId(null)
    setExcludedIds(new Set()) // 남은 제외 표시는 삭제 후 무의미 — 함께 초기화
    void chrome.runtime.sendMessage({ type: MSG.CLEAR_SESSION })
  }
  const onToggleExclude = (id: string): void => {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const onToggleAll = (): void => {
    // 제외가 하나도 없으면 전체 해제, 있으면 전체 선택 — ListView 헤더 체크박스 판정과 대칭
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
  const onSend = (): void => {
    if (!selectedCalls.length || sending) return
    setSending(true)
    const n = selectedCalls.length
    void (chrome.runtime.sendMessage({
      type: MSG.SEND_CURRENT_SESSION,
      callIds: selectedCalls.map((c) => c.id),
    }) as Promise<SendSessionResponse>)
      .then((res) => {
        const error = res?.error ?? '알 수 없는 오류'
        flash(
          res?.ok
            ? `${n}건을 서버로 전송했습니다`
            // 'no calls selected'는 splitAndArchive가 아무것도 아카이브하지 않은 short-circuit이므로
            // 보관됨 문구를 붙이면 사실과 다르다.
            : res?.error === 'no calls selected'
              ? `전송 실패: ${error}`
              : `전송 실패 — ${n}건은 히스토리에 보관됨: ${error}`,
          !!res?.ok,
        )
        if (res?.ok) setExcludedIds(new Set()) // 전송 후 잔류분은 전량 선택 상태로 초기화
      })
      .finally(() => setSending(false))
  }
  const onSelect = (id: string): void => {
    setSelectedId(id)
    setView('detail')
  }

  let content: React.ReactElement
  if (view === 'detail' && selected) {
    content = <DetailView call={selected} onBack={() => setView('list')} />
  } else if (view === 'settings') {
    content = <SettingsView settings={settings} onChange={onChangeSettings} />
  } else {
    content = (
      <ListView
        calls={calls}
        tracking={settings.trackingEnabled}
        query={query}
        freshId={freshId}
        sending={sending}
        excludedIds={excludedIds}
        selectedCalls={selectedCalls}
        settings={settings}
        onToggleTracking={onToggleTracking}
        onSearch={setQuery}
        onSelect={onSelect}
        onToggleExclude={onToggleExclude}
        onToggleAll={onToggleAll}
        onDelete={onDelete}
        onClear={onClear}
        onSend={onSend}
        onClose={() => window.close()}
      />
    )
  }

  const railView: RailView = view === 'detail' ? 'list' : view
  return (
    <div id="rootpanel" style={{ width: '100%', height: '100%', display: 'flex', minHeight: 0, position: 'relative' }}>
      {content}
      <Rail view={railView} onView={(v) => setView(v)} count={calls.length} />
      {toast && (
        <div className={'toast' + (toast.ok ? ' ok' : '')}>
          <span className="ic" data-testid={toast.ok ? 'toast-icon-ok' : 'toast-icon-err'}>
            {toast.ok ? <Check size={15} /> : <X size={15} />}
          </span>{toast.msg}
        </div>
      )}
    </div>
  )
}

const el = document.getElementById('root')
if (el) createRoot(el).render(<Panel />)
