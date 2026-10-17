// IPv4 / IPv6 CIDR math on BigInt: parsing, formatting (RFC 5952), ranges and subnet splitting.

export type Ver = 4 | 6
export interface Cidr {
  v: Ver
  addr: bigint
  prefix: number
}

export const bits = (v: Ver) => (v === 4 ? 32 : 128)
const ALL = (v: Ver) => (1n << BigInt(bits(v))) - 1n

export function parseIPv4(s: string): bigint | null {
  const p = s.trim().split('.')
  if (p.length !== 4) return null
  let r = 0n
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255 || (x.length > 1 && x[0] === '0')) return null
    r = (r << 8n) | BigInt(Number(x))
  }
  return r
}

export function parseIPv6(s: string): bigint | null {
  let str = s.trim().toLowerCase()
  if (!str || /[^0-9a-f:.]/.test(str)) return null
  // embedded IPv4 tail (e.g. ::ffff:192.168.0.1)
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(str)
  if (m) {
    const v4 = parseIPv4(m[2])
    if (v4 === null) return null
    str = `${m[1]}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`
  }
  const dbl = str.split('::')
  if (dbl.length > 2) return null
  const part = (t: string) => (t === '' ? [] : t.split(':'))
  const head = part(dbl[0])
  const tail = dbl.length === 2 ? part(dbl[1]) : []
  const missing = 8 - head.length - tail.length
  if (dbl.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(dbl.length === 2 ? missing : 0).fill('0'), ...tail]
  let r = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    r = (r << 16n) | BigInt(parseInt(g, 16))
  }
  return r
}

export function formatIPv4(n: bigint): string {
  return [24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 255n)).join('.')
}

/** RFC 5952 canonical form: lowercase, longest run (≥2) of zero groups compressed. */
export function formatIPv6(n: bigint): string {
  const g: number[] = []
  for (let i = 7; i >= 0; i--) g.push(Number((n >> BigInt(i * 16)) & 0xffffn))
  let bs = -1, bl = 0
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) { i++; continue }
    let j = i
    while (j < 8 && g[j] === 0) j++
    if (j - i > bl && j - i >= 2) { bs = i; bl = j - i }
    i = j
  }
  const hex = g.map((x) => x.toString(16))
  if (bs < 0) return hex.join(':')
  return `${hex.slice(0, bs).join(':')}::${hex.slice(bs + bl).join(':')}`
}

/** Fully expanded IPv6 (8 groups of 4 hex digits). */
export function expandIPv6(n: bigint): string {
  return n.toString(16).padStart(32, '0').match(/.{4}/g)!.join(':')
}

export const fmtAddr = (v: Ver, n: bigint) => (v === 4 ? formatIPv4(n) : formatIPv6(n))

export function maskOf(v: Ver, prefix: number): bigint {
  return prefix === 0 ? 0n : (ALL(v) >> BigInt(bits(v) - prefix)) << BigInt(bits(v) - prefix)
}

/** Parses "10.0.0.0/8", "2001:db8::/32", "192.168.1.10 255.255.255.0" or a bare address (host route). */
export function parseCidr(input: string): Cidr | string {
  const s = input.trim()
  if (!s) return 'Enter an address in CIDR notation, e.g. 192.168.1.0/24'
  const [a, p0] = s.split(/\s*\/\s*|\s+/)
  const v: Ver = a.includes(':') ? 6 : 4
  const addr = v === 4 ? parseIPv4(a) : parseIPv6(a)
  if (addr === null) return `“${a}” is not a valid IPv${v} address`
  const p = p0 ?? String(bits(v))
  let prefix: number
  if (v === 4 && p.includes('.')) {
    const m = parseIPv4(p)
    if (m === null) return `“${p}” is not a valid netmask`
    prefix = m.toString(2).split('').filter((b) => b === '1').length
    if (maskOf(4, prefix) !== m) return `${p} is not a contiguous netmask`
  } else {
    if (!/^\d{1,3}$/.test(p)) return `Prefix “/${p}” must be a number`
    prefix = Number(p)
  }
  if (prefix < 0 || prefix > bits(v)) return `IPv${v} prefix must be 0–${bits(v)}`
  return { v, addr, prefix }
}

export interface Info {
  v: Ver
  prefix: number
  input: bigint
  network: bigint
  last: bigint
  mask: bigint
  wildcard: bigint
  total: bigint
  usable: bigint
  firstHost: bigint
  lastHost: bigint
  aligned: boolean
  kind: string
}

export function info(c: Cidr): Info {
  const mask = maskOf(c.v, c.prefix)
  const network = c.addr & mask
  const wildcard = ALL(c.v) ^ mask
  const last = network | wildcard
  const total = wildcard + 1n
  let usable = total, firstHost = network, lastHost = last
  if (c.v === 4 && c.prefix <= 30) {
    usable = total - 2n
    firstHost = network + 1n
    lastHost = last - 1n
  }
  return { v: c.v, prefix: c.prefix, input: c.addr, network, last, mask, wildcard, total, usable, firstHost, lastHost, aligned: network === c.addr, kind: classify(c.v, network) }
}

const V4_RANGES: [string, string][] = [
  ['0.0.0.0/8', '“This” network'],
  ['10.0.0.0/8', 'Private (RFC 1918)'],
  ['100.64.0.0/10', 'Carrier-grade NAT (RFC 6598)'],
  ['127.0.0.0/8', 'Loopback'],
  ['169.254.0.0/16', 'Link-local'],
  ['172.16.0.0/12', 'Private (RFC 1918)'],
  ['192.0.2.0/24', 'Documentation (TEST-NET-1)'],
  ['192.168.0.0/16', 'Private (RFC 1918)'],
  ['198.18.0.0/15', 'Benchmarking'],
  ['198.51.100.0/24', 'Documentation (TEST-NET-2)'],
  ['203.0.113.0/24', 'Documentation (TEST-NET-3)'],
  ['224.0.0.0/4', 'Multicast'],
  ['240.0.0.0/4', 'Reserved'],
]
const V6_RANGES: [string, string][] = [
  ['::1/128', 'Loopback'],
  ['::/128', 'Unspecified'],
  ['::ffff:0:0/96', 'IPv4-mapped'],
  ['64:ff9b::/96', 'NAT64'],
  ['2001:db8::/32', 'Documentation'],
  ['2002::/16', '6to4'],
  ['fc00::/7', 'Unique local (ULA)'],
  ['fe80::/10', 'Link-local'],
  ['ff00::/8', 'Multicast'],
  ['2000::/3', 'Global unicast'],
]

export function classify(v: Ver, n: bigint): string {
  for (const [r, name] of v === 4 ? V4_RANGES : V6_RANGES) {
    const c = parseCidr(r) as Cidr
    if ((n & maskOf(v, c.prefix)) === c.addr) return name
  }
  return v === 4 ? 'Public' : 'Reserved / other'
}

export function ipv4Class(n: bigint): string {
  const o = Number(n >> 24n)
  return o < 128 ? 'A' : o < 192 ? 'B' : o < 224 ? 'C' : o < 240 ? 'D (multicast)' : 'E (reserved)'
}

/** Binary string grouped by octet (v4) or hextet (v6). */
export function binary(v: Ver, n: bigint): string[] {
  const s = n.toString(2).padStart(bits(v), '0')
  return s.match(v === 4 ? /.{8}/g : /.{16}/g)!
}

/** Splits a network into subnets of `newPrefix`; returns at most `limit` rows plus the total count. */
export function split(c: Cidr, newPrefix: number, limit = 256): { count: bigint; rows: Info[] } {
  const base = info(c)
  if (newPrefix < c.prefix || newPrefix > bits(c.v)) return { count: 0n, rows: [] }
  const count = 1n << BigInt(newPrefix - c.prefix)
  const step = 1n << BigInt(bits(c.v) - newPrefix)
  const rows: Info[] = []
  for (let i = 0n; i < count && i < BigInt(limit); i++) rows.push(info({ v: c.v, addr: base.network + i * step, prefix: newPrefix }))
  return { count, rows }
}

/** Smallest prefix that holds `hosts` usable addresses. */
export function prefixForHosts(v: Ver, hosts: number): number {
  for (let p = bits(v); p >= 0; p--) {
    const u = info({ v, addr: 0n, prefix: p }).usable
    if (u >= BigInt(hosts)) return p
  }
  return 0
}

/** Human-friendly big counts: exact under 1e15, else 2^n form. */
export function count(n: bigint): string {
  if (n < 1_000_000_000_000_000n) return Number(n).toLocaleString('en-US')
  const p = n.toString(2).length - 1
  return (1n << BigInt(p)) === n ? `2^${p}` : `≈ ${Number(n).toExponential(3)}`
}
