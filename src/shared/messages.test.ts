import { describe, it, expect } from 'vitest'
import { MSG, POSTMSG_SOURCE } from './messages'
import type { CaptureMessage, SendSessionMessage, SendCurrentSessionMessage, DeleteCallMessage } from './messages'

describe('message constants', () => {
  it('exposes all runtime message types', () => {
    expect(MSG.API_CAPTURED).toBe('API_CAPTURED')
    expect(MSG.SESSION_CHANGE).toBe('SESSION_CHANGE')
    expect(MSG.SEND_SESSION).toBe('SEND_SESSION')
    expect(MSG.TOGGLE_TRACKING).toBe('TOGGLE_TRACKING')
    expect(MSG.OPEN_SIDEPANEL).toBe('OPEN_SIDEPANEL')
    expect(MSG.CLEAR_SESSION).toBe('CLEAR_SESSION')
  })

  it('defines a stable postMessage source tag', () => {
    expect(POSTMSG_SOURCE).toBe('api-to-mcp-tracker')
  })

  it('typed message payloads are constructable', () => {
    const cap: CaptureMessage = {
      type: MSG.API_CAPTURED,
      payload: {
        id: 'c1', url: 'u', method: 'GET', requestHeaders: {}, requestBody: null,
        responseStatus: 200, responseHeaders: {}, responseBody: null, durationMs: 1, capturedAt: 1,
        pageUrl: 'https://example.com',
      },
    }
    const send: SendSessionMessage = { type: MSG.SEND_SESSION, sessionId: 's1' }
    expect(cap.type).toBe('API_CAPTURED')
    expect(send.sessionId).toBe('s1')
  })

  it('exposes cherry-pick send and delete-call message types', () => {
    expect(MSG.SEND_CURRENT_SESSION).toBe('SEND_CURRENT_SESSION')
    expect(MSG.DELETE_CALL).toBe('DELETE_CALL')
  })

  it('SendCurrentSessionMessage and DeleteCallMessage are constructable', () => {
    const sendCur: SendCurrentSessionMessage = {
      type: MSG.SEND_CURRENT_SESSION,
      callIds: ['c1', 'c2'],
    }
    const del: DeleteCallMessage = { type: MSG.DELETE_CALL, callId: 'c1' }
    expect(sendCur.callIds).toHaveLength(2)
    expect(del.callId).toBe('c1')
  })
})
