import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListView } from './ListView'
import type { ApiCall } from '../../shared/types'

const call = (over: Partial<ApiCall> = {}): ApiCall => ({
  id: 'c1', url: 'https://api.shop.io/v1/users?p=1', method: 'GET',
  requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {},
  responseBody: '{}', durationMs: 12, capturedAt: 1700000000000, ...over,
})

const base = {
  tracking: true, query: '', freshId: null, sending: false,
  onToggleTracking: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
  onClear: vi.fn(), onGoSend: vi.fn(), onClose: vi.fn(),
}

describe('ListView', () => {
  it('shows empty state when there are no calls', () => {
    render(<ListView {...base} calls={[]} />)
    expect(screen.getByText('아직 수집된 요청이 없습니다')).toBeInTheDocument()
  })

  it('renders one entry per call with method badge, path and status', () => {
    render(<ListView {...base} calls={[call()]} />)
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('/v1/users')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('calls onSelect with the call id when an entry is clicked', () => {
    const onSelect = vi.fn()
    render(<ListView {...base} calls={[call()]} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('/v1/users'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('filters by query (path/method)', () => {
    render(<ListView {...base} calls={[call({ id: 'a', url: 'https://x/users' }), call({ id: 'b', url: 'https://x/orders' })]} query="orders" />)
    expect(screen.queryByText('/users')).not.toBeInTheDocument()
    expect(screen.getByText('/orders')).toBeInTheDocument()
  })

  it('toggles tracking via the recbar button', () => {
    const onToggleTracking = vi.fn()
    render(<ListView {...base} calls={[]} onToggleTracking={onToggleTracking} />)
    fireEvent.click(screen.getByTitle('수집 일시정지'))
    expect(onToggleTracking).toHaveBeenCalled()
  })
})
