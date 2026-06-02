// Match a host against a whitelist pattern. Supports a leading "*." wildcard
// (matches the apex and any subdomain) or an exact host string.
export function matchDomain(host: string, pattern: string): boolean {
  if (!pattern) return false
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2)
    return host === base || host.endsWith('.' + base)
  }
  return host === pattern
}
