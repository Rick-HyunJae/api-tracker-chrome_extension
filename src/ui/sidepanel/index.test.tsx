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
})
