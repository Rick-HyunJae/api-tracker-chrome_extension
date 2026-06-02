import React, { useState } from 'react'
import type { ApiCall } from '../../shared/types'
import { hostOf, pathOf, sizeOf, statusClass, headersEntries, highlightJson, formatTime } from './view-utils'
import { Back } from './icons'
import { CopyBtn } from './CopyBtn'

type Tab = 'body' | 'res' | 'req'

export function DetailView({ call, onBack }: { call: ApiCall; onBack: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('body')
  const resHeaders = headersEntries(call.responseHeaders)
  const reqHeaders = headersEntries(call.requestHeaders)
  const headersText = (hs: [string, string][]): string => hs.map(([k, v]) => `${k}: ${v}`).join('\n')

  // Derive the body format from the response Content-Type (not hardcoded JSON).
  const ct = (call.responseHeaders['content-type'] ?? call.responseHeaders['Content-Type'] ?? '').toLowerCase()
  const fmt = !call.responseBody
    ? '—'
    : ct.includes('json') ? 'JSON' : ct.includes('html') ? 'HTML' : ct.includes('xml') ? 'XML' : (ct.split(';')[0] || 'TEXT')

  return (
    <div className="pmain">
      <div className="dhead">
        <button className="dback" onClick={onBack}><Back size={15} /> 수집 리스트</button>
        <div className="durl">
          <div className="durl-top">
            <span className={'badge ' + call.method}>{call.method}</span>
            <span className={'status ' + statusClass(call.responseStatus)} style={{ fontSize: 12 }}>{call.responseStatus}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{formatTime(call.capturedAt)}</span>
          </div>
          <div className="full"><span style={{ color: 'var(--text-3)' }}>https://{hostOf(call.url)}</span><b>{pathOf(call.url)}</b></div>
          <div className="durl-stat">
            <span>응답 <b>{call.durationMs}ms</b></span>
            <span>크기 <b>{sizeOf(call.responseBody)}B</b></span>
            <span>형식 <b>{fmt}</b></span>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab' + (tab === 'body' ? ' active' : '')} onClick={() => setTab('body')}>본문</button>
        <button className={'tab' + (tab === 'res' ? ' active' : '')} onClick={() => setTab('res')}>응답 헤더<span className="n">{resHeaders.length}</span></button>
        <button className={'tab' + (tab === 'req' ? ' active' : '')} onClick={() => setTab('req')}>요청 헤더<span className="n">{reqHeaders.length}</span></button>
      </div>

      <div className="scroll">
        {tab === 'body' && (call.responseBody ? (
          <>
            <div className="section-tools"><CopyBtn text={call.responseBody} label="본문 복사" /></div>
            <div className="codeblock"><pre className="code" dangerouslySetInnerHTML={{ __html: highlightJson(call.responseBody) }} /></div>
          </>
        ) : (
          <div className="empty-body">{call.responseStatus} · 본문 없음 (No Content)</div>
        ))}
        {tab === 'res' && (
          <>
            <div className="section-tools"><CopyBtn text={headersText(resHeaders)} label="헤더 복사" /></div>
            <div className="kv">{resHeaders.map(([k, v], i) => (
              <div className="kv-row" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}</div>
          </>
        )}
        {tab === 'req' && (
          <>
            <div className="section-tools"><CopyBtn text={headersText(reqHeaders)} label="헤더 복사" /></div>
            <div className="kv">{reqHeaders.map(([k, v], i) => (
              <div className="kv-row" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}</div>
          </>
        )}
      </div>

      <div className="pfoot">
        <CopyBtn text={call.url} label="요청 URL 복사" />
        <span style={{ marginLeft: 'auto' }}>
          <CopyBtn text={`curl -X ${call.method} '${call.url}'`} label="cURL" />
        </span>
      </div>
    </div>
  )
}
