import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendView } from './SendView'
import type { ApiCall, Settings } from '../../shared/types'

const call = (m: string): ApiCall => ({
  id: m, url: 'https://x/a', method: m, requestHeaders: {}, requestBody: null,
  responseStatus: 200, responseHeaders: {}, responseBody: 'abc', durationMs: 1, capturedAt: 1,
})
const settings = { serverUrl: 'https://c/api' } as Settings
const base = {
  settings, sending: false, name: '', namePlaceholder: 'x · 7/28 세션',
  onName: vi.fn(), onSend: vi.fn(),
}

describe('SendView', () => {
  it('shows the selected count and the endpoint', () => {
    render(<SendView {...base} calls={[call('GET'), call('POST')]} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('https://c/api')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /선택 2건 전송/ })).toBeInTheDocument()
  })

  it('disables the send button when there are no selected calls', () => {
    render(<SendView {...base} calls={[]} />)
    expect(screen.getByRole('button', { name: /선택 0건 전송/ })).toBeDisabled()
  })

  it('calls onSend on click', () => {
    const onSend = vi.fn()
    render(<SendView {...base} calls={[call('GET')]} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    expect(onSend).toHaveBeenCalled()
  })

  it('renders a session-name input with placeholder and forwards changes', () => {
    const onName = vi.fn()
    render(<SendView {...base} calls={[call('GET')]} onName={onName} />)
    const input = screen.getByPlaceholderText('x · 7/28 세션')
    fireEvent.change(input, { target: { value: '결제 API' } })
    expect(onName).toHaveBeenCalledWith('결제 API')
  })

  it('shows an indeterminate progress bar while sending', () => {
    render(<SendView {...base} calls={[call('GET')]} sending={true} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /업로드 중/ })).toBeDisabled()
    expect(screen.getByPlaceholderText('x · 7/28 세션')).toBeDisabled()
  })
})
