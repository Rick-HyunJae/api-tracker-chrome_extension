import React, { useEffect, useRef, useState } from 'react'
import { getStorage, onStorageChanged } from '../../shared/storage'
import { MSG } from '../../shared/messages'
import { getDockTop, setDockTop } from './dock-position'

// Dark-teal design tokens, scoped to the widget's shadow root via :host so the
// host page's CSS cannot leak in or out. Values mirror src/ui/theme/tokens.css.
// Hover-reveal + the transparent ::before bridge are preserved verbatim from the
// prior dead-zone fix (docs/solutions/ui-bugs/shadow-dom-hover-deadzone-bridge.md):
// the bridge geometry is relative to .amt-root, so vertical drag does not break it.
const STYLE = `
:host {
  --accent: oklch(0.74 0.075 210);
  --accent-ink: oklch(0.20 0.02 235);
  --surface-hi: oklch(0.27 0.015 262);
  --border: oklch(0.31 0.014 262);
  --text-2: oklch(0.74 0.01 260);
  --rec: oklch(0.67 0.115 30);
  --canvas: oklch(0.12 0.012 260);
  --mono: "IBM Plex Mono", ui-monospace, monospace;
}
.amt-root { position: fixed; right: 0; font-family: var(--mono); touch-action: none; }
.amt-root::before { content: ''; position: absolute; right: 0; width: 60px; pointer-events: none; }
.amt-root[data-drop="down"]::before { top: -8px; height: 96px; }
.amt-root[data-drop="up"]::before   { bottom: -8px; height: 96px; }
.amt-root:hover::before { pointer-events: auto; }
.amt-root.dragging { cursor: grabbing; }
.amt-root.dragging .amt-main, .amt-root.dragging .amt-chip { transition: none; }

.amt-main { width: 34px; height: 34px; border-radius: 50%; border: none; padding: 0;
  cursor: pointer; color: var(--accent-ink); display: flex; align-items: center; justify-content: center;
  background: linear-gradient(150deg, var(--accent), oklch(0.66 0.07 252));
  box-shadow: -5px 7px 22px -7px oklch(0.05 0.01 260 / 0.85), 0 0 0 1px oklch(1 0 0 / 0.1) inset;
  position: relative; z-index: 1; transform: translateX(50%); transition: transform .25s ease; }
.amt-root:hover .amt-main { transform: translateX(0); }
.amt-main svg { width: 16px; height: 16px; }
.amt-badge { position: absolute; top: -10px; left: -10px; background: var(--rec); color: #fff;
  border-radius: 9px; font-size: 9.5px; min-width: 16px; height: 16px; line-height: 16px;
  text-align: center; padding: 0 4px; border: 2px solid var(--canvas); font-weight: 600; }

.amt-chip { position: absolute; right: 0; width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid var(--border); padding: 0; cursor: pointer; background: var(--surface-hi);
  color: var(--text-2); z-index: 1; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 7px 18px -7px oklch(0.05 0.01 260 / 0.8);
  opacity: 0; pointer-events: none; transition: transform .28s cubic-bezier(.2,.8,.3,1), opacity .2s; }
.amt-chip svg { width: 15px; height: 15px; }
.amt-chip[data-state="tracking"] { color: var(--accent); border-color: oklch(0.74 0.075 210 / 0.5);
  background: oklch(0.74 0.075 210 / 0.14); }
.amt-chip[data-state="tracking"]::after { content: ''; position: absolute; inset: -1px; border-radius: 50%;
  box-shadow: 0 0 0 0 oklch(0.67 0.115 30 / 0.5); animation: amt-ping 1.5s ease-out infinite; }
@keyframes amt-ping { 0% { box-shadow: 0 0 0 0 oklch(0.67 0.115 30 / 0.45);} 70%,100% { box-shadow: 0 0 0 8px transparent;} }
.amt-rec-dot { position: absolute; top: -2px; right: -2px; width: 9px; height: 9px; border-radius: 50%;
  background: var(--rec); border: 2px solid var(--canvas); }
.amt-root[data-drop="down"] .amt-chip { top: 42px; transform: translateY(-10px); }
.amt-root[data-drop="up"]   .amt-chip { bottom: 42px; transform: translateY(10px); }
.amt-root:hover .amt-chip { opacity: 1; pointer-events: auto; transform: translateY(0); }
`

function PanelIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      style={{ transform: open ? 'scaleX(1)' : 'scaleX(-1)' }}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  )
}

// Broadcast / signal glyph — represents live capture (design choice over play/pause).
function BroadcastIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

const DRAG_THRESHOLD = 3
const CHIP_REACH = 52 // chip offset (42) + breathing room

export function FloatingWidget(): React.ReactElement {
  const [count, setCount] = useState(0)
  const [tracking, setTracking] = useState(true)
  const [dropUp, setDropUp] = useState(false)
  const [top, setTop] = useState<number>(() => Math.round(window.innerHeight * 0.5))
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startY: 0, startTop: 0, moved: false })
  const topRef = useRef(top)
  topRef.current = top
  // Removes the active drag's window listeners; reset to a no-op when idle.
  const dragCleanup = useRef<() => void>(() => {})

  useEffect(() => {
    let mounted = true
    void getStorage().then((s) => {
      if (!mounted) return
      setCount(s.currentSession?.calls.length ?? 0)
      setTracking(s.settings.trackingEnabled)
    })
    void getDockTop().then((t) => {
      if (mounted && t !== null) setTop(t)
    })
    onStorageChanged((changes) => {
      if (changes.currentSession) {
        const v = changes.currentSession.newValue as { calls?: unknown[] } | null
        setCount(v?.calls?.length ?? 0)
      }
      if (changes.settings) {
        const v = changes.settings.newValue as { trackingEnabled?: boolean }
        if (typeof v?.trackingEnabled === 'boolean') setTracking(v.trackingEnabled)
      }
    })
    return () => {
      mounted = false
      dragCleanup.current()
    }
  }, [])

  // Flip the chip above the main button only when it would overflow the viewport.
  const handleEnter = (): void => {
    setDropUp(top + 34 + CHIP_REACH > window.innerHeight)
  }

  // Track the drag on window — deliberately NOT via setPointerCapture. Capturing
  // the pointer on .amt-root (an ancestor of the buttons) makes Chrome retarget the
  // trailing `click` to the captor, so neither button's onClick ever fires (the
  // dead-button bug). window listeners keep the drag alive after the cursor leaves
  // the 34px widget without ever touching click dispatch.
  const onPointerDown = (e: React.PointerEvent): void => {
    drag.current = { active: true, startY: e.clientY, startTop: topRef.current, moved: false }
    rootRef.current?.classList.add('dragging')

    const onMove = (ev: PointerEvent): void => {
      const d = drag.current
      if (!d.active) return
      const dy = ev.clientY - d.startY
      // A sub-3px twitch stays a click — don't nudge the dock or re-render.
      if (Math.abs(dy) <= DRAG_THRESHOLD) return
      d.moved = true
      // `|| 90` (not `?? 90`): jsdom and pre-layout mounts report offsetHeight === 0,
      // which `??` would not replace, breaking the clamp upper bound.
      const h = rootRef.current?.offsetHeight || 90
      const next = Math.max(10, Math.min(window.innerHeight - h - 10, d.startTop + dy))
      setTop(next)
    }
    const end = (): void => {
      drag.current.active = false
      rootRef.current?.classList.remove('dragging')
      dragCleanup.current()
      if (drag.current.moved) void setDockTop(topRef.current)
    }
    dragCleanup.current = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      dragCleanup.current = () => {}
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // Suppress the click that fires immediately after a drag; let real clicks through.
  const guard = (fn: () => void) => (): void => {
    if (drag.current.moved) {
      drag.current.moved = false
      return
    }
    fn()
  }

  const state = tracking ? 'tracking' : 'paused'

  return (
    <div
      className="amt-root"
      data-testid="widget-root"
      data-drop={dropUp ? 'up' : 'down'}
      style={{ top }}
      onMouseEnter={handleEnter}
      onPointerDown={onPointerDown}
      ref={rootRef}
    >
      <style>{STYLE}</style>
      <button
        className="amt-chip"
        data-testid="widget-track-toggle"
        data-state={state}
        aria-label={tracking ? '추적 중지' : '추적 시작'}
        onClick={guard(() =>
          chrome.runtime.sendMessage({ type: MSG.TOGGLE_TRACKING, enabled: !tracking }),
        )}
      >
        <BroadcastIcon />
        {tracking && <span className="amt-rec-dot" />}
      </button>
      <button
        className="amt-main"
        data-testid="widget-button"
        data-state={state}
        aria-label="패널 열기"
        onClick={guard(() => chrome.runtime.sendMessage({ type: MSG.OPEN_SIDEPANEL }))}
      >
        <PanelIcon open={false} />
        <span className="amt-badge" data-testid="widget-badge">
          {count}
        </span>
      </button>
    </div>
  )
}
