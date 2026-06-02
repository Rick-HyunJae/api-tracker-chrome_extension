import React, { useState } from 'react'
import { Check, Copy } from './icons'

export function CopyBtn({ text, label = '복사' }: { text: string; label?: string }): React.ReactElement {
  const [done, setDone] = useState(false)
  const copy = (): void => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setDone(true)
    setTimeout(() => setDone(false), 1300)
  }
  return (
    <button className={'copy-btn' + (done ? ' done' : '')} onClick={copy}>
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? '복사됨' : label}
    </button>
  )
}
