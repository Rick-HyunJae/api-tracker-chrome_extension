import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SummaryBar } from './SummaryBar'
import { DEFAULT_SETTINGS } from '../../shared/types'
import type { ApiCall, Settings } from '../../shared/types'

const call = (id: string, method: string): ApiCall => ({
  id, url: 'https://api.shop.io/v1/users', method,
  requestHeaders: {}, requestBody: null, responseStatus: 200, responseHeaders: {},
  responseBody: 'abcde', durationMs: 1, capturedAt: 1,
})

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS, serverUrl: 'http://localhost:4599', ...over,
})

const base = { totalCount: 2, disabled: false, onToggleAll: vi.fn() }

describe('SummaryBar', () => {
  it('shows selected/total count, payload size and target host in the collapsed row', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} />)
    expect(screen.getByText(/1\/2건/)).toBeInTheDocument()
    expect(screen.getByText(/localhost:4599/)).toBeInTheDocument()
  })

  it('checks the select-all box only when every call is selected', () => {
    const { rerender } = render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).not.toBeChecked()
    rerender(<SummaryBar {...base} calls={[call('a', 'GET'), call('b', 'POST')]} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeChecked()
  })

  it('leaves the select-all box unchecked when there are no calls at all', () => {
    render(<SummaryBar {...base} totalCount={0} calls={[]} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).not.toBeChecked()
  })

  it('forwards select-all clicks', () => {
    const onToggleAll = vi.fn()
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} onToggleAll={onToggleAll} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }))
    expect(onToggleAll).toHaveBeenCalled()
  })

  it('hides the detail until expanded, then shows method distribution', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET'), call('b', 'POST')]} settings={settings()} />)
    expect(screen.queryByText('대상')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('POST')).toBeInTheDocument()
    expect(screen.getByText('대상')).toBeInTheDocument()
  })

  it('shows the configured session name in the detail', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings({ sessionName: '주문 API' })} />)
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    expect(screen.getByText('주문 API')).toBeInTheDocument()
  })

  it('falls back to 이름 없음 when the session name is blank', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings({ sessionName: '   ' })} />)
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    expect(screen.getByText('이름 없음')).toBeInTheDocument()
  })

  it('shows (미설정) as the target when serverUrl is empty', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings({ serverUrl: '' })} />)
    expect(screen.getByText(/\(미설정\)/)).toBeInTheDocument()
  })

  it('collapses again on a second toggle click', () => {
    render(<SummaryBar {...base} calls={[call('a', 'GET')]} settings={settings()} />)
    fireEvent.click(screen.getByRole('button', { name: '요약 펼치기' }))
    fireEvent.click(screen.getByRole('button', { name: '요약 접기' }))
    expect(screen.queryByText('대상')).not.toBeInTheDocument()
  })

  it('disables the select-all box when disabled', () => {
    render(<SummaryBar {...base} calls={[]} totalCount={0} disabled={true} settings={settings()} />)
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled()
  })
})
