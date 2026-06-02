import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendView } from './SendView'
import type { ApiCall, Settings } from '../../shared/types'

const call = (m: string): ApiCall => ({
  id: m, url: 'https://x/a', method: m, requestHeaders: {}, requestBody: null,
  responseStatus: 200, responseHeaders: {}, responseBody: 'abc', durationMs: 1, capturedAt: 1,
})
const settings = { serverUrl: 'https://c/api' } as Settings

describe('SendView', () => {
  it('shows the capture count and the endpoint', () => {
    render(<SendView calls={[call('GET'), call('POST')]} settings={settings} sending={false} progress={0} onSend={vi.fn()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('https://c/api')).toBeInTheDocument()
  })

  it('disables the send button when there are no calls', () => {
    render(<SendView calls={[]} settings={settings} sending={false} progress={0} onSend={vi.fn()} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onSend on click', () => {
    const onSend = vi.fn()
    render(<SendView calls={[call('GET')]} settings={settings} sending={false} progress={0} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSend).toHaveBeenCalled()
  })
})
