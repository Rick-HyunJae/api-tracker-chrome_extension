import React from 'react'
import type { ApiCall } from '../../shared/types'
import { hostOf, pathOf, sizeOf, statusClass, formatTime } from './view-utils'
import { Stack, Play, Pause, Trash, Search, Chevron, Send } from './icons'

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

export function ListView(props: ListViewProps): React.ReactElement {
  const { calls, tracking, query, freshId, sending } = props
  const q = query.toLowerCase()
  const filtered = calls.filter(
    (c) => !q || pathOf(c.url).toLowerCase().includes(q) || c.method.toLowerCase().includes(q),
  )
  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph"><Stack size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>API 수집기</h1>
          <div className="sub">REST · 사이드 패널</div>
        </div>
        <button className="icon-btn" title="패널 닫기" onClick={props.onClose}><Chevron size={17} /></button>
      </div>

      <div className={'recbar' + (tracking ? ' live' : '')}>
        <button
          className={'rec-toggle ' + (tracking ? 'on' : 'off')}
          onClick={props.onToggleTracking}
          title={tracking ? '수집 일시정지' : '수집 시작'}
        >
          {tracking ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className="rec-meta">
          <div className="rec-state">
            <span className="blip" style={{ background: tracking ? 'var(--rec)' : 'var(--text-3)' }} />
            {tracking ? '수집 중' : '일시정지됨'}
          </div>
          <div className="rec-count">
            <b>{calls.length}</b>건 수집됨{tracking ? ' · URL 이동 감지 중' : ' · 토글하여 시작'}
          </div>
        </div>
        <button
          className="icon-btn"
          title="전체 삭제"
          onClick={props.onClear}
          disabled={!calls.length}
          style={{ opacity: calls.length ? 1 : 0.4 }}
        >
          <Trash size={16} />
        </button>
      </div>

      <div className="searchrow">
        <Search size={14} />
        <input
          placeholder="경로 · 메서드 검색"
          value={query}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>

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

      <div className="scroll">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="ring"><Stack size={22} /></div>
            <p>{calls.length ? '검색 결과가 없습니다' : '아직 수집된 요청이 없습니다'}</p>
            <span>{calls.length ? query : '수집을 시작하고 페이지를 이동해 보세요'}</span>
          </div>
        ) : (
          <div className="list">
            {filtered.map((c) => (
              <div key={c.id} className="entry-row">
                <input
                  type="checkbox"
                  className="entry-check"
                  aria-label="전송 대상"
                  checked={!props.excludedIds.has(c.id)}
                  onChange={() => props.onToggleExclude(c.id)}
                  disabled={sending}
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
                  disabled={sending}
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pfoot">
        <button className="btn btn-primary" disabled={!props.selectedCount || sending} onClick={props.onGoSend}>
          {sending ? '전송 중…' : <><Send size={16} /> 서버로 전송 <span className="pill">{props.selectedCount}</span></>}
        </button>
        <button className="btn btn-ghost" title="전체 삭제" onClick={props.onClear} disabled={!calls.length}>
          <Trash size={16} />
        </button>
      </div>
    </div>
  )
}
