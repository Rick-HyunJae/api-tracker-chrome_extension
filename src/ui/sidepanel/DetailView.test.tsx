import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailView } from './DetailView'
import type { ApiCall } from '../../shared/types'

const call: ApiCall = {
  id: 'c1', url: 'https://api.shop.io/v1/users', method: 'POST',
  requestHeaders: { 'x-req': 'r' }, requestBody: null, responseStatus: 201,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"ok":true}', durationMs: 30, capturedAt: 1700000000000,
}

describe('DetailView', () => {
  it('shows the body tab by default with highlighted JSON', () => {
    render(<DetailView call={call} onBack={vi.fn()} />)
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('switches to the response headers tab', () => {
    render(<DetailView call={call} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /응답 헤더/ }))
    expect(screen.getByText('content-type')).toBeInTheDocument()
  })

  it('calls onBack', () => {
    const onBack = vi.fn()
    render(<DetailView call={call} onBack={onBack} />)
    fireEvent.click(screen.getByText('수집 리스트'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows a no-content message when the body is empty', () => {
    render(<DetailView call={{ ...call, responseBody: null }} onBack={vi.fn()} />)
    expect(screen.getByText(/본문 없음/)).toBeInTheDocument()
  })

  it('renders the actual scheme instead of hardcoding https', () => {
    render(<DetailView call={{ ...call, url: 'http://localhost:8787/api/orders' }} onBack={vi.fn()} />)
    expect(screen.getByText('http://localhost:8787')).toBeInTheDocument()
    expect(screen.queryByText('https://localhost:8787')).not.toBeInTheDocument()
  })
})
