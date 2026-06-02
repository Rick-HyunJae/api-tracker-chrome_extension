import React from 'react'
import { Stack, Cloud, Gear, Clock } from './icons'

export type RailView = 'list' | 'send' | 'settings'

interface RailProps {
  view: RailView
  onView: (v: RailView) => void
  count: number
}

export function Rail({ view, onView, count }: RailProps): React.ReactElement {
  return (
    <div className="rail">
      <div className="tabs-top">
        <button className={'rail-btn' + (view === 'list' ? ' active' : '')} onClick={() => onView('list')}>
          <Stack size={19} /><span className="lab">수집</span>
          {count ? <span className="ndot">{count > 99 ? '99+' : count}</span> : null}
        </button>
        <button className={'rail-btn' + (view === 'send' ? ' active' : '')} onClick={() => onView('send')}>
          <Cloud size={19} /><span className="lab">전송</span>
        </button>
        <button className="rail-btn" disabled title="준비 중">
          <Stack size={19} /><span className="lab">MCP</span>
        </button>
        <button className="rail-btn" disabled title="준비 중">
          <Clock size={19} /><span className="lab">히스토리</span>
        </button>
      </div>
      <div className="spacer" />
      <button className={'rail-btn' + (view === 'settings' ? ' active' : '')} onClick={() => onView('settings')}>
        <Gear size={19} /><span className="lab">설정</span>
      </button>
      <div className="ava">K</div>
    </div>
  )
}
