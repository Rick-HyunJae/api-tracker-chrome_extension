import { describe, it, expect } from 'vitest'
import { matchDomain } from './domain-match'

describe('matchDomain', () => {
  it('matches a subdomain against a *. wildcard', () => {
    expect(matchDomain('api.shopmall.io', '*.shopmall.io')).toBe(true)
  })
  it('matches the bare apex against a *. wildcard', () => {
    expect(matchDomain('shopmall.io', '*.shopmall.io')).toBe(true)
  })
  it('rejects an unrelated host against a *. wildcard', () => {
    expect(matchDomain('evil.com', '*.shopmall.io')).toBe(false)
  })
  it('matches an exact host', () => {
    expect(matchDomain('example.com', 'example.com')).toBe(true)
  })
  it('rejects a subdomain against an exact (non-wildcard) host', () => {
    expect(matchDomain('x.example.com', 'example.com')).toBe(false)
  })
  it('rejects an empty pattern', () => {
    expect(matchDomain('example.com', '')).toBe(false)
  })
})
