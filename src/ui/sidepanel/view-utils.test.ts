import { describe, it, expect } from 'vitest'
import { hostOf, pathOf, sizeOf, statusClass, headersEntries, highlightJson, formatTime } from './view-utils'

describe('view-utils', () => {
  it('hostOf extracts the host', () => {
    expect(hostOf('https://api.example.com/v1/users?x=1')).toBe('api.example.com')
  })
  it('pathOf extracts the path without query', () => {
    expect(pathOf('https://api.example.com/v1/users?x=1')).toBe('/v1/users')
  })
  it('hostOf/pathOf are safe on malformed urls', () => {
    expect(hostOf('not a url')).toBe('')
    expect(pathOf('not a url')).toBe('not a url')
  })
  it('sizeOf returns body length, 0 for null', () => {
    expect(sizeOf('abcd')).toBe(4)
    expect(sizeOf(null)).toBe(0)
  })
  it('statusClass maps ranges', () => {
    expect(statusClass(200)).toBe('ok')
    expect(statusClass(301)).toBe('warn')
    expect(statusClass(404)).toBe('err')
    expect(statusClass(500)).toBe('err')
  })
  it('headersEntries converts a record to pairs', () => {
    expect(headersEntries({ a: '1', b: '2' })).toEqual([['a', '1'], ['b', '2']])
  })
  it('highlightJson wraps keys and strings in token spans', () => {
    const html = highlightJson('{"a":"b"}')
    expect(html).toContain('tok-key')
    expect(html).toContain('tok-str')
  })
  it('highlightJson escapes HTML in untrusted response bodies (no raw tags)', () => {
    const html = highlightJson('{"x":"</span><img src=x onerror=alert(1)>"}')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
  it('formatTime returns zero-padded HH:MM:SS', () => {
    // Asserts the format contract (padding + separators) without depending on the
    // host timezone of the test runner.
    expect(formatTime(1700000000000)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})
