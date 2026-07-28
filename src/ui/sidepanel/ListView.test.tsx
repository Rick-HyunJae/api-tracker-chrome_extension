import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListView } from './ListView'
import { DEFAULT_SETTINGS } from '../../shared/types'
import type { ApiCall } from '../../shared/types'

const call = (over: Partial<ApiCall> = {}): ApiCall => ({
  id: 'c1', url: 'https://api.shop.io/v1/users?p=1', method: 'GET',
  requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {},
  responseBody: '{}', durationMs: 12, capturedAt: 1700000000000, ...over,
})

const base = {
  tracking: true, query: '', freshId: null, sending: false,
  excludedIds: new Set<string>(), selectedCalls: [call()],
  settings: { ...DEFAULT_SETTINGS, serverUrl: 'http://localhost:4599' },
  onToggleTracking: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(),
  onToggleExclude: vi.fn(), onToggleAll: vi.fn(), onDelete: vi.fn(),
  onClear: vi.fn(), onSend: vi.fn(), onClose: vi.fn(),
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

  it('renders a checkbox per entry, checked when not excluded', () => {
    render(<ListView {...base} calls={[call()]} />)
    expect(screen.getByRole('checkbox', { name: '전송 대상' })).toBeChecked()
  })

  it('renders the checkbox unchecked when the call is excluded', () => {
    render(<ListView {...base} calls={[call()]} excludedIds={new Set(['c1'])} selectedCalls={[]} />)
    expect(screen.getByRole('checkbox', { name: '전송 대상' })).not.toBeChecked()
  })

  it('toggling a checkbox calls onToggleExclude with the call id', () => {
    const onToggleExclude = vi.fn()
    render(<ListView {...base} calls={[call()]} onToggleExclude={onToggleExclude} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '전송 대상' }))
    expect(onToggleExclude).toHaveBeenCalledWith('c1')
  })

  it('select-all checkbox calls onToggleAll', () => {
    const onToggleAll = vi.fn()
    render(<ListView {...base} calls={[call()]} onToggleAll={onToggleAll} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }))
    expect(onToggleAll).toHaveBeenCalled()
  })

  it('delete button calls onDelete with the call id', () => {
    const onDelete = vi.fn()
    render(<ListView {...base} calls={[call()]} onDelete={onDelete} />)
    fireEvent.click(screen.getByTitle('이 호출 삭제'))
    expect(onDelete).toHaveBeenCalledWith('c1')
  })

  it('footer send button shows the selected count, fires onSend, and disables at zero', () => {
    const onSend = vi.fn()
    const { rerender } = render(<ListView {...base} calls={[call()]} selectedCalls={[call()]} onSend={onSend} />)
    // '1' 은 recbar 의 수집 건수(<b>)와도 우연히 겹치므로 pill 로 범위를 좁힌다
    expect(screen.getByText('1', { selector: '.pill' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /서버로 전송/ }))
    expect(onSend).toHaveBeenCalled()
    rerender(<ListView {...base} calls={[call()]} selectedCalls={[]} onSend={onSend} />)
    expect(screen.getByRole('button', { name: /서버로 전송/ })).toBeDisabled()
  })

  it('disables the row checkbox and delete button while sending', () => {
    render(<ListView {...base} calls={[call()]} sending={true} />)
    expect(screen.getByRole('checkbox', { name: '전송 대상' })).toBeDisabled()
    expect(screen.getByTitle('이 호출 삭제')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled()
    for (const btn of screen.getAllByTitle('전체 삭제')) {
      expect(btn).toBeDisabled()
    }
    const footerSend = screen.getByRole('button', { name: '전송 중…' })
    expect(footerSend).toBeDisabled()
    expect(footerSend).toHaveTextContent('전송 중…')
  })

  it('renders the summary bar with the selected count and target host', () => {
    render(<ListView {...base} calls={[call(), call({ id: 'c2' })]} selectedCalls={[call()]} />)
    expect(screen.getByText(/1\/2건/)).toBeInTheDocument()
    expect(screen.getByText(/localhost:4599/)).toBeInTheDocument()
  })
})
