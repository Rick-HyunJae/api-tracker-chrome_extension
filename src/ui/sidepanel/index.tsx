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
import { SendView } from './SendView'
import { SettingsView } from './SettingsView'
import { Check } from './icons'
import '../theme/components.css'

type View = RailView | 'detail'

export function Panel(): React.ReactElement {
  const [session, setSession] = useState<CurrentSession | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
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
    void patchStorage({ currentSession: { ...session, calls: [] } })
  }
  const onSend = (): void => {
    if (!session || !calls.length || sending) return
    setSending(true)
    const n = calls.length
    void (chrome.runtime.sendMessage({ type: MSG.SEND_SESSION, sessionId: session.sessionId }) as Promise<SendSessionResponse>)
      .then((res) => flash(res?.ok ? `${n}건을 서버로 전송했습니다` : `전송 실패: ${res?.error ?? '알 수 없는 오류'}`, !!res?.ok))
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
  } else if (view === 'send') {
    content = <SendView calls={calls} settings={settings} sending={sending} progress={sending ? 50 : 0} onSend={onSend} />
  } else {
    content = (
      <ListView
        calls={calls}
        tracking={settings.trackingEnabled}
        query={query}
        freshId={freshId}
        sending={sending}
        onToggleTracking={onToggleTracking}
        onSearch={setQuery}
        onSelect={onSelect}
        onClear={onClear}
        onGoSend={() => setView('send')}
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
          <span className="ic"><Check size={15} /></span>{toast.msg}
        </div>
      )}
    </div>
  )
}

const el = document.getElementById('root')
if (el) createRoot(el).render(<Panel />)
