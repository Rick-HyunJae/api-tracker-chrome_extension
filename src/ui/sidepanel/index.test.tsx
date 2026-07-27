import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Panel } from './index'
import { MSG } from '../../shared/messages'

const session = {
  sessionId: 's1', url: 'https://x/a', startedAt: 1, status: 'recording',
  calls: [{
    id: 'c1', url: 'https://api.shop.io/v1/users', method: 'GET',
    requestHeaders: {}, requestBody: null, responseStatus: 200,
    responseHeaders: {}, responseBody: '{}', durationMs: 5, capturedAt: 1,
  }],
}
const settings = {
  serverUrl: '', apiKey: '', trackingEnabled: true, blacklistedDomains: [],
  domainWhitelist: [], captureMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  saveBody: true, autoSend: false, dedupe: false,
}

describe('Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ currentSession: session, settings })
  })

  it('renders captured entries from storage', async () => {
    render(<Panel />)
    await waitFor(() => expect(screen.getByText('/v1/users')).toBeInTheDocument())
  })

  it('opens the detail view when an entry is clicked', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByText('/v1/users'))
    await waitFor(() => expect(screen.getByText('수집 리스트')).toBeInTheDocument())
  })

  it('toggles tracking via a runtime message', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByTitle('수집 일시정지'))
    fireEvent.click(screen.getByTitle('수집 일시정지'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.TOGGLE_TRACKING, enabled: false })
  })

  it('navigates to settings via the rail', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: /설정/ }))
    await waitFor(() => expect(screen.getByText('업로드 엔드포인트')).toBeInTheDocument())
  })

  it('sends SEND_CURRENT_SESSION with the selected callIds and name', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: '전송' })) // Rail → Send 뷰
    fireEvent.change(screen.getByPlaceholderText(/세션/), { target: { value: '내 세션' } })
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MSG.SEND_CURRENT_SESSION, name: '내 세션', callIds: ['c1'],
      }),
    )
  })

  it('omits name when the input is blank', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: '전송' }))
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MSG.SEND_CURRENT_SESSION, name: undefined, callIds: ['c1'],
      }),
    )
  })

  it('excluding a call via its checkbox removes it from the send payload', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('checkbox', { name: '전송 대상' })) // c1 제외
    expect(screen.getByRole('button', { name: /서버로 전송/ })).toBeDisabled()
  })

  it('sends DELETE_CALL when the row delete button is clicked', async () => {
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByTitle('이 호출 삭제'))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.DELETE_CALL, callId: 'c1' })
  })

  it('failure toast does not carry the ok class and shows the error icon', async () => {
    ;(chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'timeout' })
    render(<Panel />)
    await waitFor(() => screen.getByText('/v1/users'))
    fireEvent.click(screen.getByRole('button', { name: '전송' }))
    fireEvent.click(screen.getByRole('button', { name: /선택 1건 전송/ }))
    const toast = await screen.findByText(/전송 실패/)
    expect(toast.closest('.toast')!.className).not.toContain('ok')
    expect(screen.getByTestId('toast-icon-err')).toBeInTheDocument()
  })
})
