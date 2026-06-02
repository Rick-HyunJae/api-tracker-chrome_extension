import React from 'react'
import type { Settings } from '../../shared/types'
import { Gear } from './icons'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

interface SettingsViewProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsView({ settings, onChange }: SettingsViewProps): React.ReactElement {
  const toggleMethod = (m: string): void => {
    const has = settings.captureMethods.includes(m)
    onChange({ captureMethods: has ? settings.captureMethods.filter((x) => x !== m) : [...settings.captureMethods, m] })
  }
  const Switch = ({ k }: { k: 'saveBody' | 'autoSend' | 'dedupe' }): React.ReactElement => (
    <button
      className={'sw' + (settings[k] ? ' on' : '')}
      data-testid={'sw-' + k}
      onClick={() => onChange({ [k]: !settings[k] } as Partial<Settings>)}
    />
  )

  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph" style={{ background: 'var(--surface-hi)', color: 'var(--text)' }}><Gear size={16} /></div>
        <div style={{ flex: 1 }}><h1>설정</h1><div className="sub">capture &amp; upload</div></div>
      </div>
      <div className="scroll">
        <div className="settings">
          <div className="set-group">
            <h3>전송 서버</h3>
            <div className="field">
              <label htmlFor="set-endpoint">업로드 엔드포인트</label>
              <input id="set-endpoint" type="text" value={settings.serverUrl} onChange={(e) => onChange({ serverUrl: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="set-token">인증 토큰 (선택)</label>
              <input id="set-token" type="text" placeholder="Bearer …" value={settings.apiKey} onChange={(e) => onChange({ apiKey: e.target.value })} />
            </div>
          </div>

          <div className="set-group">
            <h3>캡처 대상</h3>
            <div className="field">
              <label htmlFor="set-domain">도메인 화이트리스트 <small style={{ color: 'var(--text-3)' }}>(콤마 구분, 비우면 전체)</small></label>
              <input
                id="set-domain"
                type="text"
                placeholder="*.example.com, api.foo.io"
                value={settings.domainWhitelist.join(', ')}
                onChange={(e) => onChange({ domainWhitelist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
            <div className="field">
              <label>HTTP 메서드</label>
              <div className="chips">
                {METHODS.map((m) => (
                  <button key={m} className={'chip' + (settings.captureMethods.includes(m) ? ' on' : '')} onClick={() => toggleMethod(m)}>{m}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>동작</h3>
            <div className="togrow">
              <div className="lbl">응답 본문 저장<small>JSON 본문을 함께 기록합니다</small></div>
              <Switch k="saveBody" />
            </div>
            <div className="togrow">
              <div className="lbl">자동 전송<small>50건마다 서버로 자동 업로드</small></div>
              <Switch k="autoSend" />
            </div>
            <div className="togrow">
              <div className="lbl">중복 URL 제외<small>같은 경로는 마지막 응답만 유지</small></div>
              <Switch k="dedupe" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
