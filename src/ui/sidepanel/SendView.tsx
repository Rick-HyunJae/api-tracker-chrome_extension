import React from 'react'
import type { ApiCall, Settings } from '../../shared/types'
import { sizeOf } from './view-utils'
import { Cloud, Send } from './icons'

interface SendViewProps {
  calls: ApiCall[] // 선택된(전송 대상) 호출만 전달된다
  settings: Settings
  sending: boolean
  name: string
  namePlaceholder: string
  onName: (v: string) => void
  onSend: () => void
}

const methodVar: Record<string, string> = {
  GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del',
}

export function SendView({ calls, settings, sending, name, namePlaceholder, onName, onSend }: SendViewProps): React.ReactElement {
  const byMethod = calls.reduce<Record<string, number>>((a, e) => {
    a[e.method] = (a[e.method] ?? 0) + 1
    return a
  }, {})
  const totalBytes = calls.reduce((a, e) => a + sizeOf(e.responseBody), 0)

  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph"><Cloud size={17} /></div>
        <div style={{ flex: 1 }}><h1>서버로 전송</h1><div className="sub">batch upload</div></div>
      </div>
      <div className="scroll">
        <div className="settings">
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

          <div className="set-group">
            <h3>업로드 요약</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '13px 14px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600 }}>{calls.length}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>선택 건수</div>
              </div>
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '13px 14px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600 }}>{(totalBytes / 1024).toFixed(1)}<span style={{ fontSize: 13, color: 'var(--text-3)' }}>KB</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>페이로드</div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>메서드 분포</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Object.entries(byMethod).map(([m, n]) => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className={'badge ' + m} style={{ width: 52, textAlign: 'center' }}>{m}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: (calls.length ? (n / calls.length) * 100 : 0) + '%', background: `var(--m-${methodVar[m] ?? 'get'})`, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', width: 22, textAlign: 'right' }}>{n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="set-group">
            <h3>대상</h3>
            <div className="durl" style={{ background: 'var(--surface)' }}>
              <div className="full"><span style={{ color: 'var(--text-3)' }}>POST </span><b>{settings.serverUrl || '(미설정)'}</b></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pfoot" style={{ flexDirection: 'column', gap: 9, alignItems: 'stretch' }}>
        {sending && <div className="progress-indet" role="progressbar" aria-label="업로드 진행 중" />}
        <button className="btn btn-primary" disabled={!calls.length || sending} onClick={onSend} style={{ height: 44 }}>
          {sending ? '업로드 중…' : <><Send size={16} /> 선택 {calls.length}건 전송</>}
        </button>
      </div>
    </div>
  )
}
