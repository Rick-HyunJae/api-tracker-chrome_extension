import React, { useState } from 'react'
import type { ApiCall, Settings } from '../../shared/types'
import { hostOf, sizeOf } from './view-utils'
import { Chevron } from './icons'

interface SummaryBarProps {
  calls: ApiCall[] // 선택된(전송 대상) 호출만 전달된다
  totalCount: number
  settings: Settings
  disabled: boolean
  onToggleAll: () => void
}

const methodVar: Record<string, string> = {
  GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del',
}

export function SummaryBar({ calls, totalCount, settings, disabled, onToggleAll }: SummaryBarProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const byMethod = calls.reduce<Record<string, number>>((a, e) => {
    a[e.method] = (a[e.method] ?? 0) + 1
    return a
  }, {})
  const totalBytes = calls.reduce((a, e) => a + sizeOf(e.responseBody), 0)
  // serverUrl이 비면 hostOf가 ''를 반환하므로 접힘 행·상세 모두 (미설정)으로 떨어진다
  const target = settings.serverUrl || '(미설정)'
  const targetHost = hostOf(settings.serverUrl) || target
  const name = settings.sessionName.trim() || '이름 없음'

  return (
    <div className="sumbar">
      <div className="sumbar-row">
        <input
          type="checkbox"
          aria-label="전체 선택"
          checked={totalCount > 0 && calls.length === totalCount}
          onChange={onToggleAll}
          disabled={disabled}
        />
        <span className="sumbar-stat">
          {calls.length}/{totalCount}건 · {(totalBytes / 1024).toFixed(1)}KB · {targetHost}
        </span>
        <button
          className={'sumbar-toggle' + (expanded ? ' open' : '')}
          aria-label={expanded ? '요약 접기' : '요약 펼치기'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Chevron size={14} />
        </button>
      </div>

      {expanded && (
        <div className="sumbar-detail">
          {Object.entries(byMethod).map(([m, n]) => (
            <div key={m} className="sumbar-dist">
              <span className={'badge ' + m}>{m}</span>
              <div className="sumbar-track">
                <div
                  className="sumbar-fill"
                  style={{
                    width: (calls.length ? (n / calls.length) * 100 : 0) + '%',
                    background: `var(--m-${methodVar[m] ?? 'get'})`,
                  }}
                />
              </div>
              <span className="sumbar-n">{n}</span>
            </div>
          ))}
          <div className="sumbar-kv"><span>이름</span><b>{name}</b></div>
          <div className="sumbar-kv"><span>대상</span><b>POST {target}</b></div>
        </div>
      )}
    </div>
  )
}
